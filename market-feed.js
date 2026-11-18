const SYMBOLS=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","LINKUSDT","PEPEUSDT","FLOKIUSDT","BONKUSDT"];
const STREAMS=SYMBOLS.map(s=>s.toLowerCase()+"@bookTicker").join("/");
const BINANCE_WS="wss://stream.binance.com:9443/stream?streams="+STREAMS;
export class BinanceMarketFeed {
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.socket=null;this.quotes={};this.lastMessageAt=0;this.lastPersistAt=0;this.connecting=false;this.loadPromise=this.ctx.storage.get("feed_state").then(v=>{if(v){this.quotes=v.quotes||{};this.lastMessageAt=v.lastMessageAt||0;}});}
  async fetch(request){
    await this.loadPromise;
    const url=new URL(request.url);
    if(url.pathname==="/connect"){await this.connect();return this.response({ok:true,connected:this.isOpen(),source:"BINANCE_WEBSOCKET"});}
    if(url.pathname==="/snapshot"){if(!this.isOpen())await this.connect();const now=Date.now();const quotes={};for(const [s,q] of Object.entries(this.quotes)){if(now-q.timestamp<=15000)quotes[s]=q;}return this.response({ok:Object.keys(quotes).length>0,connected:this.isOpen(),source:"BINANCE_WEBSOCKET",lastMessageAt:this.lastMessageAt,quotes,staleSymbols:SYMBOLS.filter(s=>!quotes[s])});}
    if(url.pathname==="/health")return this.response({ok:true,connected:this.isOpen(),symbols:SYMBOLS.length,lastMessageAt:this.lastMessageAt});
    return this.response({ok:false,error:"NOT_FOUND"},404);
  }
  response(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
  isOpen(){return this.socket&&this.socket.readyState===1;}
  async connect(){
    if(this.isOpen()||this.connecting)return;
    this.connecting=true;
    try{
      const ws=new WebSocket(BINANCE_WS);this.socket=ws;
      ws.addEventListener("open",()=>{this.connecting=false;this.ctx.storage.setAlarm(Date.now()+25000).catch(()=>{});});
      ws.addEventListener("message",event=>{try{const msg=JSON.parse(event.data);const d=msg.data||msg;const symbol=String(d.s||"").toUpperCase();if(!SYMBOLS.includes(symbol))return;const bid=Number(d.b),ask=Number(d.a);if(!(bid>0&&ask>=bid))return;const timestamp=Number(d.E)||Date.now();this.quotes[symbol]={price:(bid+ask)/2,bid,ask,timestamp,source:"BINANCE_WEBSOCKET"};this.lastMessageAt=Date.now();if(this.lastMessageAt-this.lastPersistAt>1000){this.lastPersistAt=this.lastMessageAt;this.ctx.storage.put("feed_state",{quotes:this.quotes,lastMessageAt:this.lastMessageAt}).catch(()=>{});}}catch{}});
      ws.addEventListener("close",()=>{this.connecting=false;this.socket=null;this.ctx.storage.setAlarm(Date.now()+5000).catch(()=>{});});
      ws.addEventListener("error",()=>{this.connecting=false;try{ws.close();}catch{}});
    }catch{this.connecting=false;this.ctx.storage.setAlarm(Date.now()+10000).catch(()=>{});}
  }
  async alarm(){if(!this.isOpen())await this.connect();else this.ctx.storage.setAlarm(Date.now()+25000).catch(()=>{});}
}
