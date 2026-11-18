import test from "node:test";
import assert from "node:assert/strict";
import { BinanceMarketFeed } from "../market-feed.js";

class FakeSocket {
  constructor(){ this.readyState=0; this.listeners={}; }
  addEventListener(name,fn){ this.listeners[name]=fn; }
  send(){}
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
  const t=Date.now();
  feed.record("BTCUSDT","binance",65000,64999,65001,t);
  feed.record("BTCUSDT","coinbase",65010,65009,65011,t+2);
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
