/**
 * Public Binance REST collector for the autonomous one-minute paper engine.
 * No persistent outbound WebSocket and no Durable Object dependency.
 */
export const MARKET_SYMBOLS=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","LINKUSDT","PEPEUSDT","FLOKIUSDT","BONKUSDT"];
const BASES=["https://api.binance.com","https://data-api.binance.vision"];
async function fetchKlines(symbol){
  let lastError=null;
  for(const base of BASES){
    try{
      const url=base+"/api/v3/klines?symbol="+symbol+"&interval=1m&limit=80";
      const response=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(9000)});
      if(!response.ok)throw new Error("BINANCE_HTTP_"+response.status);
      const rows=await response.json();
      if(!Array.isArray(rows)||rows.length<25)throw new Error("BINANCE_INSUFFICIENT_KLINES_"+symbol);
      const candles=rows.map(r=>({openTime:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5]),closeTime:Number(r[6])}));
      const last=candles[candles.length-1];
      return {symbol,candles,quote:{price:last.close,bid:last.close,ask:last.close,timestamp:Date.now(),exchangeEventTime:last.closeTime,source:"BINANCE_REST_KLINE_1M"}};
    }catch(error){lastError=error;}
  }
  throw lastError||new Error("BINANCE_MARKET_DATA_UNAVAILABLE");
}
export async function fetchMarketFeed(){
  const settled=await Promise.allSettled(MARKET_SYMBOLS.map(fetchKlines));
  const quotes={},candles={},errors=[];
  for(let i=0;i<settled.length;i++){
    const result=settled[i];
    if(result.status==="fulfilled"){
      quotes[result.value.symbol]=result.value.quote;
      candles[result.value.symbol]=result.value.candles;
    }else errors.push({symbol:MARKET_SYMBOLS[i],error:String(result.reason?.message||result.reason).slice(0,160)});
  }
  const quoteCount=Object.keys(quotes).length;
  return {ok:quoteCount>=8,source:"BINANCE_REST",connection:"ON_DEMAND_PER_CRON",timestamp:Date.now(),quotes,candles,staleSymbols:errors.map(x=>x.symbol),errors,quoteCount};
}
