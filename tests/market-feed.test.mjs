import test from "node:test";
import assert from "node:assert/strict";
import { BinanceMarketFeed } from "../market-feed.js";

class FakeSocket {
  static instances=[];
  constructor(){ this.readyState=0; this.listeners={}; FakeSocket.instances.push(this); }
  addEventListener(name,fn){ this.listeners[name]=fn; }
  send(data){ this.sent=data; }
  emit(name,data){ if(name==="open")this.readyState=1; this.listeners[name]?.({data:typeof data==="string"?data:JSON.stringify(data)}); }
  close(){ this.readyState=3; }
}
function makeFeed(){
  const state=new Map();
  const storage={
    get:async k=>state.get(k),
    put:async (k,v)=>state.set(k,v),
    setAlarm:async()=>{}
  };
  const ctx={storage};
  return new BinanceMarketFeed(ctx,{});
}

test("aceita somente ativos e preços válidos",()=>{
  const feed=makeFeed();
  feed.record("BTCUSDT","binance",65000,64999,65001,Date.now());
  feed.record("INVALID","binance",1,1,1,Date.now());
  feed.record("ETHUSDT","coinbase",0,0,0,Date.now());
  assert.equal(feed.quotes.BTCUSDT.binance.price,65000);
  assert.equal(feed.quotes.INVALID,undefined);
  assert.equal(feed.quotes.ETHUSDT,undefined);
});

test("mantém cotações independentes por fonte e escolhe a mais recente",async()=>{
  const feed=makeFeed();
  const realNow=Date.now;
  let clock=realNow();
  Date.now=()=>clock;
  feed.record("BTCUSDT","binance",65000,64999,65001,clock);
  clock+=2;
  feed.record("BTCUSDT","coinbase",65010,65009,65011,clock);
  Date.now=realNow;
  globalThis.WebSocket=FakeSocket;
  const response=await feed.fetch(new Request("https://feed/snapshot"));
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.quotes.BTCUSDT.selectedSource,"coinbase");
  assert.equal(body.quotes.BTCUSDT.sources.binance.price,65000);
  assert.equal(body.quotes.BTCUSDT.sources.coinbase.price,65010);
});

test("não publica cotação vencida no snapshot",async()=>{
  const feed=makeFeed();
  feed.record("BTCUSDT","binance",65000,64999,65001,Date.now());
  feed.quotes.BTCUSDT.binance.receivedAt=Date.now()-16000;
  globalThis.WebSocket=FakeSocket;
  const response=await feed.fetch(new Request("https://feed/snapshot"));
  const body=await response.json();
  assert.equal(body.quotes.BTCUSDT,undefined);
  assert.ok(body.staleSymbols.includes("BTCUSDT"));
});

test("agrega ticks em candles de um minuto sem volume real",()=>{
  const feed=makeFeed();
  feed.record("BTCUSDT","binance",65000,64999,65001,Date.now());
  const candle=feed.candles.BTCUSDT.at(-1);
  assert.equal(candle.open,65000);
  assert.equal(candle.close,65000);
  assert.equal(candle.volumeNote,"neutral_placeholder_no_exchange_volume");
});

test("health distingue socket aberto de fonte recebendo ticks",()=>{
  const feed=makeFeed();
  feed.sockets.binance=new FakeSocket();feed.sockets.binance.readyState=1;
  assert.equal(feed.health().sources.binance.connected,false);
  feed.record("BTCUSDT","binance",65000,64999,65001,Date.now());
  assert.equal(feed.health().sources.binance.connected,true);
});

test("normaliza produto Coinbase e ignora mensagem de erro",()=>{
  FakeSocket.instances=[];
  globalThis.WebSocket=FakeSocket;
  const feed=makeFeed();
  feed.connectCoinbase();
  const ws=FakeSocket.instances.at(-1);
  ws.emit("open");
  ws.emit("message",{type:"ticker",product_id:"BTC-USDT",best_bid:"65000",best_ask:"65002",price:"65001",time:new Date().toISOString()});
  assert.equal(feed.quotes.BTCUSDT.coinbase.price,65001);
  ws.emit("message",{type:"error",message:"unsupported product"});
  assert.equal(feed.lastMessageAt.coinbase,0);
});
