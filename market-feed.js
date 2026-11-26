
const SYMBOLS=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","LINKUSDT","PEPEUSDT","FLOKIUSDT","BONKUSDT"];
const STREAMS=SYMBOLS.map(s=>s.toLowerCase()+"@kline_1m").join("/");
const WS_URLS=[
  "wss://stream.binance.com:443/stream?streams="+STREAMS,
  "wss://data-stream.binance.vision/stream?streams="+STREAMS
];
const now=()=>Date.now();

export class BinanceMarketFeed {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.socket=null;this.quotes={};this.candles={};
    this.lastMessageAt=0;this.lastPersistAt=0;this.connecting=false;this.connectIndex=0;this.lastProcessedClose=0;this.dirty=false;this.persisting=false;
    this.lastError=null;this.lastClose=null;this.connectAttempts=0;
    this.loadPromise=this.ctx.storage.get("feed_state").then(v=>{
      if(v){this.quotes=v.quotes||{};this.candles=v.candles||{};this.lastMessageAt=v.lastMessageAt||0;this.lastPersistAt=v.lastPersistAt||0;this.lastProcessedClose=v.lastProcessedClose||0;this.lastError=v.lastError||null;this.lastClose=v.lastClose||null;this.connectAttempts=v.connectAttempts||0;}
    }).catch(e=>{this.lastError="STORAGE_LOAD: "+String(e?.message||e);});
  }
  async fetch(request){
    await this.loadPromise;
    const url=new URL(request.url);
    try{
      if(url.pathname==="/connect"){await this.connect();return this.response({ok:true,connecting:this.connecting,connected:this.isOpen(),source:"BINANCE_WEBSOCKET",endpoint:WS_URLS[this.connectIndex],attempts:this.connectAttempts,lastError:this.lastError});}
      if(url.pathname==="/snapshot"){
        if(!this.isOpen()&&!this.connecting)await this.connect();
        const t=now(),quotes={};
        for(const [s,q] of Object.entries(this.quotes))if(t-Number(q.timestamp)<=15000)quotes[s]=q;
        const candles={};for(const s of SYMBOLS)candles[s]=(this.candles[s]||[]).slice(-100);
        return this.response({ok:Object.keys(quotes).length>0,connected:this.isOpen(),connecting:this.connecting,source:"BINANCE_WEBSOCKET",endpoint:WS_URLS[this.connectIndex],lastMessageAt:this.lastMessageAt,quotes,candles,staleSymbols:SYMBOLS.filter(s=>!quotes[s]),candleCounts:Object.fromEntries(SYMBOLS.map(s=>[s,candles[s].length])),lastError:this.lastError,lastClose:this.lastClose,connectAttempts:this.connectAttempts});
      }
      if(url.pathname==="/health")return this.response({ok:true,connected:this.isOpen(),connecting:this.connecting,symbols:SYMBOLS.length,lastMessageAt:this.lastMessageAt,lastError:this.lastError,lastClose:this.lastClose,connectAttempts:this.connectAttempts,endpoint:WS_URLS[this.connectIndex],candleCounts:Object.fromEntries(SYMBOLS.map(s=>[s,(this.candles[s]||[]).length]))});
      return this.response({ok:false,error:"NOT_FOUND"},404);
    }catch(e){
      this.lastError=String(e?.stack||e?.message||e).slice(0,1200);
      await this.persist();
      return this.response({ok:false,error:"MARKET_FEED_REQUEST_FAILED",detail:this.lastError,connected:this.isOpen(),connecting:this.connecting},500);
    }
  }
  response(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
  isOpen(){return Boolean(this.socket&&this.socket.readyState===1);}
  async persistClosedData(){
    if(this.persisting||!this.dirty)return;
    this.persisting=true;
    try{
      while(this.dirty){
        this.dirty=false;
        const snapshot={quotes:this.quotes,candles:this.candles,lastMessageAt:this.lastMessageAt,lastPersistAt:now(),lastProcessedClose:this.lastProcessedClose,lastError:this.lastError,lastClose:this.lastClose,connectAttempts:this.connectAttempts};
        await this.ctx.storage.put("feed_state",snapshot);
        this.lastPersistAt=snapshot.lastPersistAt;
      }
    }catch(e){this.lastError="STORAGE_WRITE: "+String(e?.message||e);}
    finally{this.persisting=false;}
  }
  async persist(){
    try{await this.ctx.storage.put("feed_state",{quotes:this.quotes,candles:this.candles,lastMessageAt:this.lastMessageAt,lastPersistAt:this.lastPersistAt,lastProcessedClose:this.lastProcessedClose,lastError:this.lastError,lastClose:this.lastClose,connectAttempts:this.connectAttempts});}catch(e){this.lastError="STORAGE_WRITE: "+String(e?.message||e);}
  }
  async connect(){
    this.lastError="LEGACY_DURABLE_OBJECT_FEED_DISABLED_USE_DIRECT_BROWSER_WEBSOCKET";
    this.connecting=false;
    return;
    if(this.isOpen()||this.connecting)return;
    this.connecting=true;this.connectAttempts++;
    const endpoint=WS_URLS[this.connectIndex];
    try{
      const ws=new WebSocket(endpoint);this.socket=ws;
      ws.addEventListener("open",()=>{
        this.connecting=false;this.lastError=null;
        this.persist();
        console.log("MR_ZERO_WS_OPEN",JSON.stringify({endpoint,attempts:this.connectAttempts}));
      });
      ws.addEventListener("message",event=>{
        try{
          const msg=JSON.parse(event.data),d=msg.data||msg,symbol=String(d.s||"").toUpperCase();
          if(!SYMBOLS.includes(symbol))return;
          if(d.k){
            const k=d.k;
            const livePrice=Number(k.c);
            if(livePrice>0)this.quotes[symbol]={price:livePrice,bid:livePrice,ask:livePrice,timestamp:now(),exchangeEventTime:Number(k.T)||null,source:"BINANCE_WEBSOCKET_KLINE"};
            if(k.x){
              const row={openTime:Number(k.t),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume:Number(k.v),closeTime:Number(k.T)};
              if(Object.values(row).every(Number.isFinite)&&row.open>0&&row.close>0&&row.high>0&&row.low>0&&row.closeTime>0){
                const list=this.candles[symbol]||[],idx=list.findIndex(x=>x.openTime===row.openTime);
                if(idx>=0)list[idx]=row;else list.push(row);
                this.candles[symbol]=list.sort((a,b)=>a.openTime-b.openTime).slice(-100);
                this.quotes[symbol]={price:row.close,bid:row.close,ask:row.close,timestamp:now(),exchangeEventTime:row.closeTime,source:"BINANCE_WEBSOCKET_KLINE"};
                this.dirty=true;
                this.persistClosedData();
              }
            }
          }
          this.lastMessageAt=now();
        }catch(e){this.lastError="MESSAGE_PARSE: "+String(e?.message||e).slice(0,300);}
      });
      ws.addEventListener("close",event=>{
        this.connecting=false;this.socket=null;this.lastClose={code:event.code,reason:event.reason||"",at:now()};
        this.connectIndex=(this.connectIndex+1)%WS_URLS.length;
        this.ctx.storage.setAlarm(now()+60000).catch(()=>{});
        this.persist();
        console.log("MR_ZERO_WS_CLOSE",JSON.stringify(this.lastClose));
      });
      ws.addEventListener("error",()=>{
        this.lastError="BINANCE_WEBSOCKET_ERROR";
        this.connecting=false;
        try{ws.close();}catch{}
        this.ctx.storage.setAlarm(now()+60000).catch(()=>{});
        this.persist();
      });
    }catch(e){
      this.connecting=false;this.socket=null;this.lastError="WEBSOCKET_CONSTRUCTOR: "+String(e?.stack||e?.message||e).slice(0,800);
      this.connectIndex=(this.connectIndex+1)%WS_URLS.length;
      this.ctx.storage.setAlarm(now()+60000).catch(()=>{});
      await this.persist();
      console.log("MR_ZERO_WS_CONNECT_ERROR",this.lastError);
    }
  }
  async alarm(){
    await this.loadPromise;
    if(this.isOpen())try{this.socket.close(1000,"Autonomous feed migrated to scheduled REST");}catch{}
    this.socket=null;this.connecting=false;
    this.lastError="LEGACY_DURABLE_OBJECT_FEED_DISABLED";
    console.log("MR_ZERO_LEGACY_DO_STOPPED");
  }
}