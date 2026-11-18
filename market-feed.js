const SYMBOLS=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","LINKUSDT","PEPEUSDT","FLOKIUSDT","BONKUSDT"];
const BASES=SYMBOLS.map(s=>s.replace("USDT",""));
const BINANCE_STREAMS=SYMBOLS.map(s=>s.toLowerCase()+"@bookTicker").join("/");
const BINANCE_WS="wss://stream.binance.com:9443/stream?streams="+BINANCE_STREAMS;
const COINBASE_WS="wss://ws-feed.exchange.coinbase.com";
const MAX_AGE=15000;
const now=()=>Date.now();
export class BinanceMarketFeed {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.sockets={binance:null,coinbase:null};this.quotes={};this.candles={};this.lastMessageAt={};this.connecting={binance:false,coinbase:false};
    this.loadPromise=this.ctx.storage.get("dual_feed_state").then(v=>{if(v){this.quotes=v.quotes||{};this.candles=v.candles||{};this.lastMessageAt=v.lastMessageAt||{};}});
  }
  async fetch(request){
    await this.loadPromise;const u=new URL(request.url);
    if(u.pathname==="/connect"){await this.connectAll();return this.response({ok:true,connected:this.health().connected,sources:this.health().sources});}
    if(u.pathname==="/health")return this.response({ok:true,...this.health()});
    if(u.pathname==="/snapshot"){
      await this.connectAll();const t=now(),quotes={},candles={};
      for(const s of SYMBOLS){
        const src=this.quotes[s]||{};const fresh=Object.entries(src).filter(([,q])=>q&&Number.isFinite(q.price)&&q.price>0&&t-q.receivedAt<=MAX_AGE);
        if(!fresh.length)continue;
        fresh.sort((a,b)=>b[1].receivedAt-a[1].receivedAt);
        const [selectedSource,selected]=fresh[0];
        quotes[s]={...selected,selectedSource,sources:Object.fromEntries(fresh.map(([k,v])=>[k,v]))};
        const hist=this.candles[s]||[];if(hist.length)candles[s]=hist.slice(-80);
      }
      const staleSymbols=SYMBOLS.filter(s=>!quotes[s]);
      return this.response({ok:Object.keys(quotes).length>0,connected:this.health().connected,source:"BINANCE+COINBASE_WEBSOCKET",lastMessageAt:this.lastMessageAt,quotes,candles,staleSymbols});
    }
    return this.response({ok:false,error:"NOT_FOUND"},404);
  }
  response(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
  health(){const sources={};for(const k of ["binance","coinbase"])sources[k]={connected:this.sockets[k]?.readyState===1,lastMessageAt:this.lastMessageAt[k]||0};return{sources,connected:Object.values(sources).some(x=>x.connected),symbols:SYMBOLS.length};}
  async connectAll(){this.connectBinance();this.connectCoinbase();}
  record(symbol,source,price,bid,ask,exchangeTime){
    if(!SYMBOLS.includes(symbol)||!(price>0))return;
    const receivedAt=now();this.quotes[symbol]??={};
    this.quotes[symbol][source]={price,bid,ask,exchangeTime:Number(exchangeTime)||null,receivedAt,source:source.toUpperCase()+"_WEBSOCKET"};
    this.lastMessageAt[source]=receivedAt;
    const minute=Math.floor(receivedAt/60000)*60000;this.candles[symbol]??=[];
    let c=this.candles[symbol].at(-1);
    if(!c||c.openTime!==minute){c={openTime:minute,open:price,high:price,low:price,close:price,volume:1,closeTime:minute+59999,volumeNote:"neutral_placeholder_no_exchange_volume"};this.candles[symbol].push(c);if(this.candles[symbol].length>90)this.candles[symbol].shift();}
    else{c.high=Math.max(c.high,price);c.low=Math.min(c.low,price);c.close=price;}
    if(receivedAt-(this.lastPersistAt||0)>1000){this.lastPersistAt=receivedAt;this.ctx.storage.put("dual_feed_state",{quotes:this.quotes,candles:this.candles,lastMessageAt:this.lastMessageAt}).catch(()=>{});}
  }
  connectBinance(){
    if(this.sockets.binance?.readyState===1||this.connecting.binance)return;this.connecting.binance=true;
    try{const ws=new WebSocket(BINANCE_WS);this.sockets.binance=ws;
      ws.addEventListener("open",()=>{this.connecting.binance=false;this.ctx.storage.setAlarm(now()+20000).catch(()=>{});});
      ws.addEventListener("message",e=>{try{const d=JSON.parse(e.data).data||JSON.parse(e.data);const s=String(d.s||"").toUpperCase(),bid=Number(d.b),ask=Number(d.a);if(bid>0&&ask>=bid)this.record(s,"binance",(bid+ask)/2,bid,ask,d.E);}catch{}});
      ws.addEventListener("close",()=>{this.connecting.binance=false;this.sockets.binance=null;this.ctx.storage.setAlarm(now()+5000).catch(()=>{});});
      ws.addEventListener("error",()=>{this.connecting.binance=false;try{ws.close();}catch{}});
    }catch{this.connecting.binance=false;this.ctx.storage.setAlarm(now()+10000).catch(()=>{});}
  }
  connectCoinbase(){
    if(this.sockets.coinbase?.readyState===1||this.connecting.coinbase)return;this.connecting.coinbase=true;
    try{const ws=new WebSocket(COINBASE_WS);this.sockets.coinbase=ws;
      ws.addEventListener("open",()=>{this.connecting.coinbase=false;ws.send(JSON.stringify({type:"subscribe",product_ids:BASES.map(b=>b+"-USDT"),channels:["ticker"]}));this.ctx.storage.setAlarm(now()+20000).catch(()=>{});});
      ws.addEventListener("message",e=>{try{const d=JSON.parse(e.data);if(d.type!=="ticker")return;const s=String(d.product_id||"").replace("-","")+"".replace("-","");const symbol=s.replace(/USDT$/,"USDT");const bid=Number(d.best_bid),ask=Number(d.best_ask),price=Number(d.price);this.record(symbol,"coinbase",bid>0&&ask>=bid?(bid+ask)/2:price,bid,ask,Date.parse(d.time));}catch{}});
      ws.addEventListener("close",()=>{this.connecting.coinbase=false;this.sockets.coinbase=null;this.ctx.storage.setAlarm(now()+5000).catch(()=>{});});
      ws.addEventListener("error",()=>{this.connecting.coinbase=false;try{ws.close();}catch{}});
    }catch{this.connecting.coinbase=false;this.ctx.storage.setAlarm(now()+10000).catch(()=>{});}
  }
  async alarm(){this.connectBinance();this.connectCoinbase();this.ctx.storage.setAlarm(now()+20000).catch(()=>{});}
}