import test from "node:test";
import assert from "node:assert/strict";
import { equity, validateMarket, sizeTrade, applyTrade, micelioConsensus } from "../src/race-core.mjs";

test("equity adds cash and unrealized P&L",()=>assert.deepEqual(equity({cash_usd:8},[{symbol:"BTCUSDT",side:"BUY",qty:1,avg_entry_price:10}],{BTCUSDT:{price:12}}),{cash:8,unrealized:2,equity:10}));
test("market validation rejects invalid and stale prices",()=>{
 assert.equal(validateMarket({price:0,ts:Date.now()}).valid,false);
 assert.equal(validateMarket({price:10,ts:Date.now()-181000}).reason,"STALE_MARKET_DATA");
 assert.equal(validateMarket({price:10,ts:Date.now()}).valid,true);
});
test("sizing respects 25 percent equity cap",()=>{
 const s=sizeTrade({cash:100,equity:100,price:10});
 assert.equal(s.ok,true); assert.ok(s.notional<=25);
});
test("BUY then SELL records costs and positive realized P&L",()=>{
 const buy=applyTrade({cash:10,side:"BUY",qty:.5,price:10});
 const sell=applyTrade({cash:buy.cashAfter,side:"SELL",qty:.5,price:12,avgEntry:buy.avgEntryAfter,existingQty:buy.qtyAfter});
 assert.ok(buy.cashAfter>=0); assert.ok(sell.cashAfter>=0); assert.ok(sell.realizedPnl>0); assert.ok(buy.fee>0&&sell.fee>0); assert.ok(buy.slippageUsd>0);
});
test("BUY cannot create negative cash and SELL cannot create a short",()=>{
 assert.throws(()=>applyTrade({cash:1,side:"BUY",qty:10,price:10}),/INSUFFICIENT_CASH/);
 assert.throws(()=>applyTrade({cash:10,side:"SELL",qty:1,price:10,avgEntry:9,existingQty:0}),/NO_SHORT/);
});
test("Micelio consensus exposes votes and participant IDs",()=>{
 const c=micelioConsensus([{agentId:"a1",direction:"BUY"},{agentId:"a2",direction:"BUY"},{agentId:"a3",direction:"SELL"}]);
 assert.equal(c.action,"BUY"); assert.deepEqual(c.counts,{BUY:2,SELL:1,HOLD:0}); assert.deepEqual(c.agentIds,["a1","a2","a3"]);
});
