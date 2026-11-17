export const FEE_RATE = 0.001;
export const SLIPPAGE_RATE = 0.0005;
export const MAX_TRADE_FRACTION = 0.25;
export const MAX_POSITION_FRACTION = 0.50;
export const MAX_TOTAL_EXPOSURE_FRACTION = 0.50;

export function validateMarket(tick, now = Date.now(), maxAgeMs = 180000) {
  const price = Number(tick?.price), ts = Number(tick?.ts);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ts) || ts <= 0) return { valid:false, reason:"INVALID_PRICE_OR_TIMESTAMP", ageMs:null };
  const ageMs = now - ts;
  if (ageMs < -5000) return { valid:false, reason:"FUTURE_MARKET_TIMESTAMP", ageMs };
  if (ageMs > maxAgeMs) return { valid:false, reason:"STALE_MARKET_DATA", ageMs };
  return { valid:true, reason:null, ageMs };
}

export function equity(wallet, positions = [], prices = {}) {
  const cash = Number(wallet?.cash_usd ?? wallet?.cash ?? 0);
  const unrealized = positions.reduce((sum,p) => {
    const mark = Number(prices[p.symbol]?.price ?? prices[p.symbol]);
    if (!Number.isFinite(mark) || mark <= 0) return sum;
    const move = (mark - Number(p.avg_entry_price)) * Number(p.qty) * (p.side === "BUY" ? 1 : -1);
    return sum + move;
  }, 0);
  return { cash, unrealized, equity: cash + unrealized };
}

export function sizeTrade({ cash, equity: eq, price, totalExposure = 0, maxTradeFraction = MAX_TRADE_FRACTION, maxPositionFraction = MAX_POSITION_FRACTION, maxTotalExposureFraction = MAX_TOTAL_EXPOSURE_FRACTION }) {
  cash=Number(cash); eq=Number(eq); price=Number(price); totalExposure=Number(totalExposure);
  if (![cash,eq,price,totalExposure].every(Number.isFinite) || cash < 0 || eq <= 0 || price <= 0) return { ok:false, reason:"INVALID_SIZING_INPUT", qty:0, notional:0 };
  const budget=Math.min(cash,eq*maxTradeFraction,eq*maxPositionFraction,Math.max(0,eq*maxTotalExposureFraction-totalExposure));
  const qty=budget/(price*(1+FEE_RATE+SLIPPAGE_RATE));
  if (!Number.isFinite(qty) || qty <= 0) return { ok:false, reason:"RISK_OR_CASH_LIMIT", qty:0, notional:0 };
  return {ok:true,qty,notional:qty*price,budget};
}

export function applyTrade({ cash, side, qty, price, avgEntry = 0, existingQty = 0, feeRate = FEE_RATE, slippageRate = SLIPPAGE_RATE }) {
  cash=Number(cash); qty=Number(qty); price=Number(price); avgEntry=Number(avgEntry); existingQty=Number(existingQty);
  if (![cash,qty,price,avgEntry,existingQty,feeRate,slippageRate].every(Number.isFinite) || cash < 0 || qty <= 0 || price <= 0 || feeRate < 0 || slippageRate < 0) throw new Error("INVALID_TRADE_INPUT");
  if (!["BUY","SELL"].includes(side)) throw new Error("INVALID_TRADE_SIDE");
  const executionPrice=side==="BUY"?price*(1+slippageRate):price*(1-slippageRate);
  const notional=qty*executionPrice, fee=notional*feeRate;
  if (side==="BUY") {
    const debit=notional+fee;
    if (debit>cash+1e-10) throw new Error("INSUFFICIENT_CASH");
    const nextQty=existingQty+qty;
    return {cashAfter:cash-debit,qtyAfter:nextQty,avgEntryAfter:nextQty?(avgEntry*existingQty+executionPrice*qty)/nextQty:0,fee,slippageUsd:qty*Math.abs(executionPrice-price),realizedPnl:0,executionPrice};
  }
  if (qty>existingQty+1e-10) throw new Error("NO_SHORT_SELL_OR_EXCESS_CLOSE");
  const gross=(executionPrice-avgEntry)*qty;
  const realizedPnl=gross-fee;
  const cashAfter=cash+notional-fee;
  return {cashAfter,qtyAfter:Math.max(0,existingQty-qty),avgEntryAfter:Math.max(0,existingQty-qty)<1e-10?0:avgEntry,fee,slippageUsd:qty*Math.abs(executionPrice-price),realizedPnl,executionPrice};
}

export function micelioConsensus(signals = []) {
  const counts={BUY:0,SELL:0,HOLD:0}, agentIds=[];
  for(const s of signals) {
    if (!s || !["BUY","SELL","HOLD"].includes(s.direction)) continue;
    counts[s.direction]++;
    if (typeof s.agentId==="string") agentIds.push(s.agentId);
  }
  const total=counts.BUY+counts.SELL+counts.HOLD;
  const action=total===0?"HOLD":counts.BUY>counts.SELL&&counts.BUY>counts.HOLD?"BUY":counts.SELL>counts.BUY&&counts.SELL>counts.HOLD?"SELL":"HOLD";
  return {action,counts,total,agentIds,consensus:total?Math.max(counts.BUY,counts.SELL,counts.HOLD)/total:0};
}
