import { runAutonomousTick } from "./engine.js";
import { runRaceCycle } from "./race.js";

const SYMBOLS=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","LINKUSDT","PEPEUSDT","FLOKIUSDT","BONKUSDT"];
const STREAMS=SYMBOLS.flatMap(s=>[s.toLowerCase()+"@bookTicker",s.toLowerCase()+"@kline_1m"]).join("/");
const WS_URLS=[
  "wss://stream.binance.com:443/stream?streams="+STREAMS,
  "wss://data-stream.binance.vision/stream?streams="+STREAMS
];
const now=()=>Date.now();

export class BinanceMarketFeed {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.socket=null;this.quotes={};this.candles={};
    this.lastMessageAt=0;this.lastPersistAt=0;this.connecting=false;this.connectIndex=0;
    this.lastError=null;this.lastClose=null;this.connectAttempts=0;
    this.loadPromise=this.ctx.storage.get("feed_state").then(v=>{
      if(v){this.quotes=v.quotes||{};this.candles=v.candles||{};this.lastMessageAt=v.lastMessageAt||0;this.lastPersistAt=v.lastPersistAt||0;this.lastError=v.lastError||null;this.lastClose=v.lastClose||null;this.connectAttempts=v.connectAttempts||0;}
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
  async persist(){
    try{await this.ctx.storage.put("feed_state",{quotes:this.quotes,candles:this.candles,lastMessageAt:this.lastMessageAt,lastPersistAt:this.lastPersistAt,lastError:this.lastError,lastClose:this.lastClose,connectAttempts:this.connectAttempts});}catch(e){this.lastError="STORAGE_WRITE: "+String(e?.message||e);}
  }
  async connect(){
    if(this.isOpen()||this.connecting)return;
    this.connecting=true;this.connectAttempts++;
    const endpoint=WS_URLS[this.connectIndex];
    try{
      const ws=new WebSocket(endpoint);this.socket=ws;
      ws.addEventListener("open",()=>{
        this.connecting=false;this.lastError=null;
        this.ctx.storage.setAlarm(now()+15000).catch(e=>{this.lastError="ALARM_SET: "+String(e?.message||e);});
        this.persist();
        console.log("MR_ZERO_WS_OPEN",JSON.stringify({endpoint,attempts:this.connectAttempts}));
      });
      ws.addEventListener("message",event=>{
        try{
          const msg=JSON.parse(event.data),d=msg.data||msg,symbol=String(d.s||"").toUpperCase();
          if(!SYMBOLS.includes(symbol))return;
          if(d.k){
            const k=d.k;
            if(k.x){
              const row={openTime:Number(k.t),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume:Number(k.v),closeTime:Number(k.T)};
              if(Object.values(row).every(Number.isFinite)&&row.open>0&&row.close>0&&row.high>0&&row.low>0&&row.closeTime>0){
                const list=this.candles[symbol]||[],idx=list.findIndex(x=>x.openTime===row.openTime);
                if(idx>=0)list[idx]=row;else list.push(row);
                this.candles[symbol]=list.sort((a,b)=>a.openTime-b.openTime).slice(-100);
              }
            }
          }else{
            const bid=Number(d.b),ask=Number(d.a);
            if(bid>0&&ask>=bid)this.quotes[symbol]={price:(bid+ask)/2,bid,ask,timestamp:now(),exchangeEventTime:Number(d.E)||null,source:"BINANCE_WEBSOCKET"};
          }
          this.lastMessageAt=now();
          if(this.lastMessageAt-this.lastPersistAt>=1000){this.lastPersistAt=this.lastMessageAt;this.persist();}
        }catch(e){this.lastError="MESSAGE_PARSE: "+String(e?.message||e).slice(0,300);}
      });
      ws.addEventListener("close",event=>{
        this.connecting=false;this.socket=null;this.lastClose={code:event.code,reason:event.reason||"",at:now()};
        this.connectIndex=(this.connectIndex+1)%WS_URLS.length;
        this.ctx.storage.setAlarm(now()+5000).catch(()=>{});
        this.persist();
        console.log("MR_ZERO_WS_CLOSE",JSON.stringify(this.lastClose));
      });
      ws.addEventListener("error",()=>{
        this.lastError="BINANCE_WEBSOCKET_ERROR";
        this.connecting=false;
        try{ws.close();}catch{}
        this.ctx.storage.setAlarm(now()+5000).catch(()=>{});
        this.persist();
      });
    }catch(e){
      this.connecting=false;this.socket=null;this.lastError="WEBSOCKET_CONSTRUCTOR: "+String(e?.stack||e?.message||e).slice(0,800);
      this.connectIndex=(this.connectIndex+1)%WS_URLS.length;
      this.ctx.storage.setAlarm(now()+5000).catch(()=>{});
      await this.persist();
      console.log("MR_ZERO_WS_CONNECT_ERROR",this.lastError);
    }
  }
  async alarm(){
    await this.loadPromise;
    if(!this.isOpen()&&!this.connecting)await this.connect();
    const t=now(),quotes={};
    for(const [s,q] of Object.entries(this.quotes))if(t-Number(q.timestamp)<=15000)quotes[s]=q;
    const feed={ok:Object.keys(quotes).length>0,connected:this.isOpen(),source:"BINANCE_WEBSOCKET",lastMessageAt:this.lastMessageAt,quotes,candles:this.candles,staleSymbols:SYMBOLS.filter(s=>!quotes[s])};
    if(feed.ok){
      try{
        const engine=await runAutonomousTick(this.env,this.candles||{});
        console.log("MR_ZERO_LIVE_ENGINE",JSON.stringify({ok:engine?.ok,marketsOk:engine?.results?.length||0,marketsFailed:engine?.errors?.length||0,forecastsCreated:engine?.results?.reduce((n,x)=>n+(x.forecastsCreated||0),0)||0,forecastsEvaluated:engine?.results?.reduce((n,x)=>n+(x.evaluated||0),0)||0,errors:engine?.errors||[]}));
      }catch(e){console.log("MR_ZERO_LIVE_ENGINE_ERROR",String(e?.stack||e?.message||e).slice(0,1200));}
      try{
        const result=await runRaceCycle(this.env,feed);
        console.log("MR_ZERO_LIVE_RACE",JSON.stringify({ok:result?.ok,skipped:result?.skipped,quoteCount:result?.quoteCount,error:result?.error||null}));
      }catch(e){console.log("MR_ZERO_LIVE_RACE_ERROR",String(e?.stack||e?.message||e).slice(0,1200));}
    }else console.log("MR_ZERO_FEED_WAITING",JSON.stringify({connected:this.isOpen(),connecting:this.connecting,freshQuotes:0,lastMessageAt:this.lastMessageAt||null,lastError:this.lastError}));
    this.ctx.storage.setAlarm(now()+15000).catch(e=>console.log("MR_ZERO_ALARM_ERROR",String(e?.message||e)));
  }
}