"use client";
import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { Plus, Trash2, Tag, FileUp } from 'lucide-react';
import Papa from 'papaparse'; 
import { saveWallet, fetchWallets, deleteWallet, addTransaction } from './actions';

// --- CONFIGURATION ---
// Ensure your active CoinGecko API Key is pasted here!
const COINGECKO_API_KEY = "CG-vjFyuWRC5YohTBnQyVQTu3P2"; 

const getCGUrl = (endpoint: string) => {
  const baseUrl = `https://api.coingecko.com/api/v3${endpoint}`;
  if (COINGECKO_API_KEY && COINGECKO_API_KEY !== "YOUR_API_KEY_HERE") {
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}x_cg_demo_api_key=${COINGECKO_API_KEY}`;
  }
  return baseUrl;
};

const HEADER_COINS = [
  { id: 'bitcoin', symbol: 'BTC', color: '#f7931a' },
  { id: 'ethereum', symbol: 'ETH', color: '#627eea' },
  { id: 'solana', symbol: 'SOL', color: '#14f195' },
  { id: 'ripple', symbol: 'XRP', color: '#23292f' },
];

const SUPPORTED_CHAINS = ["ETH", "SOL", "BTC", "XRP", "BSC", "LTC", "DOT", "ICP", "AAVE", "OP"];
// ADDED VELO to the master list
const ALL_COINS = ["BTC", "ETH", "SOL", "XRP", "BNB", "LTC", "DOT", "ICP", "AAVE", "OP", "USDC", "USDT", "DAI", "FIDA", "FIL", "COMP", "PLUME", "VELO"];

export default function UniversalTracker() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [activeWallet, setActiveWallet] = useState<any>(null);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({ USDC: 1, USDT: 1, DAI: 1 });
  
  const [label, setLabel] = useState("");
  const [chain, setChain] = useState("ETH");
  
  const [tTicker, setTTicker] = useState("");
  const [tType, setTType] = useState("IN"); 
  const [tAmount, setTAmount] = useState("");
  const [tCost, setTCost] = useState("");
  const [tDate, setTDate] = useState("");
  
  const [tTickerTo, setTTickerTo] = useState("");
  const [tAmountTo, setTAmountTo] = useState("");

  const tickerToIdMap = useRef<Record<string, string>>({
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', FIDA: 'bonfida',
    USDC: 'usd-coin', DAI: 'dai', USDT: 'tether', AAVE: 'aave', OP: 'optimism',
    LTC: 'litecoin', DOT: 'polkadot', COMP: 'compound-governance-token',
    FIL: 'filecoin', BNB: 'binancecoin', PLUME: 'plume-network',
    ICP: 'internet-computer',
    // ADDED: Velodrome Finance (VELO on OP network)
    VELO: 'velodrome-finance' 
  });

  useEffect(() => {
    refreshData();
    const interval = setInterval(fetchMarketPrices, 30000);
    fetchMarketPrices();
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeWallet) setTTicker(activeWallet.chain);
  }, [activeWallet]);

  const refreshData = async () => {
    const data = await fetchWallets();
    setWallets(data);
    setActiveWallet((prev: any) => {
      if (!prev) return null;
      const updated = data.find((w: any) => w.id === prev.id);
      return updated ? updated : null;
    });
  };

  const fetchMarketPrices = async () => {
    try {
      const allTickers = new Set(["BTC", "ETH", "SOL", "XRP", "FIDA", "USDC", "DAI", "USDT"]);
      
      wallets.forEach(w => w.transactions?.forEach((t:any) => {
          if (t.ticker) {
            const cleanTick = t.ticker.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            if (cleanTick) allTickers.add(cleanTick);
          }
      }));
      
      if (tTicker) allTickers.add(tTicker.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
      if (tTickerTo) allTickers.add(tTickerTo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());

      const tickersArray = Array.from(allTickers).filter(Boolean);
      const idsToFetch = Array.from(new Set(
        tickersArray.map(tick => tickerToIdMap.current[tick] || tick.toLowerCase())
      ));

      if (idsToFetch.length > 0) {
        const res = await fetch(getCGUrl(`/simple/price?ids=${idsToFetch.join(',')}&vs_currencies=eur`));
        if (res.ok) {
          const data = await res.json();
          const newPrices: Record<string, number> = {};
          
          for (const tick of tickersArray) {
            const id = tickerToIdMap.current[tick] || tick.toLowerCase();
            if (id && data[id] !== undefined) {
              newPrices[tick] = data[id].eur;
            } else {
               newPrices[tick] = 0;
            }
          }
          setLivePrices(prev => ({ ...prev, ...newPrices }));
        }
      }
    } catch (e) {}
  };

  const handleCSVUpload = (e: any) => {
    if (!activeWallet) return;
    const file = e.target.files[0];
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const clean = (val: any) => parseFloat(val?.toString().replace(',', '.') || "0");
        for (const row of results.data as any) {
          const type = row['Operation Type'];
          const ticker = row['Currency Ticker'];
          const amount = clean(row['Operation Amount']);
          const cost = clean(row['Countervalue at Operation Date']);
          
          const isReduction = type === 'OUT' || type === 'FEES' || type === 'SEND';
          const multiplier = isReduction ? -1 : 1;

          if (ticker && Math.abs(amount) >= 0.00000001) {
            const safeTicker = ticker.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            await addTransaction(activeWallet.id, safeTicker, amount * multiplier, cost * multiplier, row['Operation Date']?.split('T')[0] || "");
          }
        }
        await refreshData();
        fetchMarketPrices();
        alert("Ledger History Sync Complete.");
        e.target.value = null; 
      }
    });
  };

  const handleManualAdd = async () => {
    if (!activeWallet || !tAmount || !tDate || !tTicker) return;
    
    const safeTicker = tTicker.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const safeTickerTo = tTickerTo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (tType === "SWAP") {
      if (!safeTickerTo || !tAmountTo || !tCost) return; 
      await addTransaction(activeWallet.id, safeTicker, -Number(tAmount), -Number(tCost), tDate);
      await addTransaction(activeWallet.id, safeTickerTo, Number(tAmountTo), Number(tCost), tDate);
    } 
    else if (tType === "SEND") {
      await addTransaction(activeWallet.id, safeTicker, -Math.abs(Number(tAmount)), 0, tDate);
    } 
    else {
      const multiplier = tType === "OUT" ? -1 : 1;
      await addTransaction(
        activeWallet.id, 
        safeTicker, 
        Number(tAmount) * multiplier, 
        Number(tCost) * multiplier, 
        tDate
      );
    }
    
    setTAmount(""); setTCost(""); setTDate(""); setTType("IN"); 
    setTTickerTo(""); setTAmountTo("");
    
    await refreshData();
    fetchMarketPrices();
  };

  let totalRealizedPL = 0;
  const realizedOuts: any[] = [];
  const assetMetrics: Record<string, { qty: number, totalCost: number }> = {};

  const sortedTxs = [...(activeWallet?.transactions || [])].sort((a:any, b:any) => new Date(a.date).getTime() - new Date(b.date).getTime());

  sortedTxs.forEach((t: any) => {
    const safeTick = t.ticker.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!assetMetrics[safeTick]) assetMetrics[safeTick] = { qty: 0, totalCost: 0 };
    const asset = assetMetrics[safeTick];

    if (t.amount > 0) {
      asset.qty += t.amount;
      asset.totalCost += t.costEuro;
    } else if (t.amount < 0) {
      const avgPrice = asset.qty > 0 ? asset.totalCost / asset.qty : 0;
      const sellQty = Math.abs(t.amount);
      const costOfSold = sellQty * avgPrice;

      const isFiatToken = ['USDC', 'USDT', 'DAI'].includes(safeTick);
      const isSendOrFiat = t.costEuro === 0 || isFiatToken;

      if (isSendOrFiat) {
        asset.qty = Math.max(0, asset.qty - sellQty);
        asset.totalCost = Math.max(0, asset.totalCost - costOfSold);
      } else {
        const sellValue = Math.abs(t.costEuro);
        const profit = sellValue - costOfSold;

        totalRealizedPL += profit;
        asset.qty = Math.max(0, asset.qty - sellQty);
        asset.totalCost = Math.max(0, asset.totalCost - costOfSold);

        if (sellValue > 0) {
          realizedOuts.push({ id: t.id, date: t.date, ticker: safeTick, qty: sellQty, sellValue: sellValue, profit: profit });
        }
      }

      if (asset.qty < 0.000001) {
        asset.qty = 0;
        asset.totalCost = 0;
      }
    }
  });

  realizedOuts.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const balances = Object.keys(assetMetrics).reduce((acc: any, tick) => {
      if (assetMetrics[tick].qty > 0.000001) {
          acc[tick] = assetMetrics[tick].qty;
      }
      return acc;
  }, {});

  const availableToSell = activeWallet ? Array.from(new Set([
    activeWallet.chain,
    ...Object.keys(balances)
  ])) : [];

  const isPricesLoaded = Object.keys(livePrices).length > 3;
  
  const totalValue = isPricesLoaded ? Object.entries(balances).reduce((acc: number, [tick, qty]: any) => acc + (qty * (livePrices[tick] || 0)), 0) : 0;
  
  const netInvested = Object.values(assetMetrics).reduce((acc: number, a: any) => acc + a.totalCost, 0);
  const profitLoss = totalValue - netInvested;

  return (
    <div className="min-h-screen bg-[#02040a] text-slate-300 p-6 md:p-10 font-sans" suppressHydrationWarning>
      <div className="max-w-7xl mx-auto w-full">
        
        <div className="flex flex-wrap gap-4 mb-10">
          {HEADER_COINS.map((c, i) => <MiniPriceChart key={c.id} coin={c} index={i} price={livePrices[c.symbol]} />)}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900/30 border border-slate-800 p-8 rounded-[2rem] backdrop-blur-md shadow-xl">
              <h2 className="text-[10px] font-black text-blue-500 mb-6 flex items-center gap-2 uppercase tracking-[0.4em]"><Plus size={16}/> Register Vault</h2>
              <input className="w-full bg-black border border-slate-800 p-4 rounded-2xl mb-3 text-xs outline-none focus:border-blue-500 transition" placeholder="Label..." value={label} onChange={e => setLabel(e.target.value)} suppressHydrationWarning />
              <select className="w-full bg-black border border-slate-800 p-4 rounded-2xl mb-6 text-xs outline-none cursor-pointer" value={chain} onChange={e => setChain(e.target.value)}>
                {SUPPORTED_CHAINS.map(c => <option key={c} value={c}>{c} Network</option>)}
              </select>
              <button onClick={async () => { await saveWallet(label, "OFFLINE_VAULT", chain); setLabel(""); await refreshData(); }} className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg">Initialize</button>
            </div>

            <div className="space-y-3">
              {wallets.map(w => (
                <div key={w.id} onClick={() => setActiveWallet(w)} className={`p-6 rounded-[2rem] border cursor-pointer transition-all flex items-center justify-between ${activeWallet?.id === w.id ? 'bg-blue-600/10 border-blue-500/50 shadow-inner' : 'bg-slate-900/20 border-slate-800 hover:border-slate-700'}`}>
                  <div className="flex items-center gap-4 overflow-hidden">
                    <Tag size={18} className={activeWallet?.id === w.id ? 'text-blue-500' : 'text-slate-500'}/>
                    <div className="overflow-hidden">
                      <p className="text-sm font-bold text-white truncate">{w.label}</p>
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest">{w.chain} Vault</p>
                    </div>
                  </div>
                  <button onClick={async (e) => { e.stopPropagation(); await deleteWallet(w.id); await refreshData(); }} className="text-slate-800 hover:text-red-500"><Trash2 size={16}/></button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-8">
            {activeWallet ? (
              <>
                <div className="bg-slate-900/20 border border-slate-800 rounded-[3rem] p-10 backdrop-blur-md shadow-2xl">
                   <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-6 overflow-x-auto no-scrollbar gap-4">
                      <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter whitespace-nowrap">{activeWallet.label}</h2>
                      <div className="flex gap-4 flex-shrink-0">
                        {Object.entries(balances).map(([tick, qty]: any) => (
                           qty > 0.0001 && <span key={tick} className="text-[10px] bg-slate-800 px-3 py-1 rounded-full font-mono whitespace-nowrap">{qty.toFixed(4)} {tick}</span>
                        ))}
                      </div>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
                      <StatBox label="Net Invested" value={`€${netInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                      <StatBox label="Current Value" value={isPricesLoaded ? `€${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Calculating...'} color="text-blue-400" />
                      <StatBox label="Active P/L" value={isPricesLoaded ? `${profitLoss >= 0 ? '+€' : '-€'}${Math.abs(profitLoss).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '...'} color={profitLoss >= 0 ? 'text-green-500' : 'text-red-500'} />
                      <StatBox label="% Growth" value={isPricesLoaded ? `${netInvested !== 0 ? ((profitLoss / netInvested) * 100).toFixed(2) : '0.00'}%` : '...'} color={profitLoss >= 0 ? 'text-green-500' : 'text-red-500'} />
                   </div>

                   <div className="mb-10 bg-black/20 p-6 rounded-3xl border border-slate-800 shadow-inner">
                      <h3 className="text-[10px] font-black uppercase text-slate-500 mb-4 tracking-widest">Market Distribution</h3>
                      <div className="space-y-3 font-mono">
                        <div className="grid grid-cols-4 text-[10px] uppercase font-black text-slate-600 pb-2 border-b border-slate-800">
                          <span>Ticker</span>
                          <span className="text-right">Balance</span>
                          <span className="text-right">Live Price</span>
                          <span className="text-right">Value</span>
                        </div>
                        {Object.entries(balances).map(([tick, qty]: any) => (
                           qty > 0.0001 && (
                             <div key={tick} className="grid grid-cols-4 items-center text-xs text-white pt-2 border-b border-slate-800/10 pb-2">
                               <span className="font-bold text-blue-500">{tick}</span>
                               <span className="text-right font-mono">{qty.toFixed(6)}</span>
                               <span className="text-right text-slate-500 italic">€{isPricesLoaded && livePrices[tick] !== undefined ? livePrices[tick].toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0.00"}</span>
                               <span className="text-right text-white font-bold">
                                €{isPricesLoaded && livePrices[tick] !== undefined ? (qty * livePrices[tick]).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0.00"}
                               </span>
                             </div>
                           )
                        ))}
                      </div>
                   </div>

                   {realizedOuts.length > 0 && (
                     <div className="mb-10 bg-black/20 p-6 rounded-3xl border border-slate-800 shadow-inner">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Realized P/L (OUT Records)</h3>
                          <span className={`text-xs font-black font-mono ${totalRealizedPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            Total: {totalRealizedPL >= 0 ? '+€' : '-€'}{Math.abs(totalRealizedPL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 text-[10px] uppercase font-black text-slate-600 pb-2 border-b border-slate-800 mb-2">
                          <span>Date</span>
                          <span className="text-right">Amount Sold</span>
                          <span className="text-right">Sale Value</span>
                          <span className="text-right">Profit / Loss</span>
                        </div>
                        <div className="max-h-[140px] overflow-y-auto no-scrollbar pr-2 space-y-1 font-mono">
                          {realizedOuts.map((out: any) => (
                               <div key={out.id} className="grid grid-cols-4 items-center text-[11px] text-white pt-2 border-b border-slate-800/10 pb-2">
                                 <span className="text-slate-500 text-[9px]">{out.date}</span>
                                 <span className="text-right font-bold">{out.qty.toFixed(6)} <span className="text-[8px] text-slate-600">{out.ticker}</span></span>
                                 <span className="text-right">€{out.sellValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                 <span className={`text-right font-black ${out.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {out.profit >= 0 ? '+' : '-'}€{Math.abs(out.profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                 </span>
                               </div>
                          ))}
                        </div>
                     </div>
                   )}

                   <GrowthPanel chain={activeWallet.chain} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem]">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Add Manual Record</h3>
                      <label className="flex items-center gap-2 bg-blue-600/10 text-blue-400 px-3 py-1.5 rounded-xl text-[9px] font-black cursor-pointer hover:bg-blue-600 hover:text-white transition-all shadow-lg active:scale-95">
                        <FileUp size={14} /> BULK CSV
                        <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
                      </label>
                    </div>
                    <div className="space-y-4">
                      
                      <div className="grid grid-cols-10 gap-2 w-full items-center">
                        <div className="col-span-4 min-w-0">
                          <input 
                            className="w-full bg-black border border-slate-800 px-3 py-4 rounded-2xl text-xs outline-none focus:border-blue-500 transition uppercase min-w-0" 
                            placeholder="Coin (e.g. AAVE)" 
                            value={tTicker} 
                            onChange={e => setTTicker(e.target.value.toUpperCase())} 
                            list="available-coins" 
                          />
                          <datalist id="available-coins">
                            {availableToSell.map(coin => (
                              <option key={coin as string} value={coin as string} />
                            ))}
                            {ALL_COINS.filter(c => !availableToSell.includes(c)).map(coin => (
                              <option key={coin} value={coin} />
                            ))}
                          </datalist>
                        </div>

                        <div className="col-span-3 min-w-0">
                          <select className="w-full bg-black border border-slate-800 px-1 py-4 rounded-2xl text-[10px] font-black outline-none focus:border-blue-500 transition text-center min-w-0" value={tType} onChange={e => setTType(e.target.value)}>
                            <option value="IN" className="text-green-500">IN</option>
                            <option value="OUT" className="text-red-500">OUT</option>
                            <option value="SWAP" className="text-blue-500">SWAP</option>
                            <option value="SEND" className="text-slate-400">SEND</option>
                          </select>
                        </div>
                        
                        <div className="col-span-3 min-w-0">
                          <input 
                            type="date" 
                            className="w-full bg-black border border-slate-800 px-2 py-4 rounded-2xl text-[10px] sm:text-xs outline-none text-center min-w-0" 
                            style={{ minWidth: 0 }} 
                            value={tDate} 
                            onChange={e => setTDate(e.target.value)} 
                          />
                        </div>
                      </div>
                      
                      {tType === 'SWAP' && (
                        <div className="flex gap-2 animate-in fade-in zoom-in duration-300">
                          <input 
                            className="flex-1 bg-black border border-slate-800 p-4 rounded-2xl text-xs outline-none focus:border-blue-500 transition uppercase" 
                            placeholder="To Coin (e.g. PEPE)" 
                            value={tTickerTo} 
                            onChange={e => setTTickerTo(e.target.value.toUpperCase())} 
                            list="all-coins" 
                          />
                          <datalist id="all-coins">
                            {ALL_COINS.map(coin => (
                              <option key={coin} value={coin} />
                            ))}
                          </datalist>
                          <input type="number" className="flex-1 bg-black border border-slate-800 p-4 rounded-2xl text-xs outline-none focus:border-blue-500 transition" placeholder="Qty Received" value={tAmountTo} onChange={e => setTAmountTo(e.target.value)} />
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <input type="number" className="w-full bg-black border border-slate-800 p-4 rounded-2xl text-xs outline-none focus:border-blue-500 transition" placeholder={tType === 'SWAP' ? "Qty Sold" : "Qty"} value={tAmount} onChange={e => setTAmount(e.target.value)} />
                        <input type="number" className="w-full bg-black border border-slate-800 p-4 rounded-2xl text-xs outline-none focus:border-blue-500 transition disabled:opacity-50" placeholder={tType === 'SEND' ? "Cost (N/A)" : tType === 'SWAP' ? "Value at Swap €" : "Total Value €"} value={tType === 'SEND' ? "" : tCost} onChange={e => setTCost(e.target.value)} disabled={tType === 'SEND'} />
                      </div>
                      <button onClick={handleManualAdd} className="w-full bg-slate-800 hover:bg-blue-600 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Add Record</button>
                    </div>
                  </div>

                  <div className="bg-slate-900/10 border border-slate-800 rounded-[2.5rem] p-8 max-h-[420px] overflow-y-auto no-scrollbar">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 font-mono">Vault Ledger</h3>
                    <div className="space-y-3">
                      {activeWallet.transactions?.sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((t: any) => (
                        <div key={t.id} className="flex justify-between items-center p-4 bg-black/30 border border-slate-800 rounded-2xl group hover:border-blue-500/50 transition-all">
                             <div>
                               <p className="text-[9px] text-slate-600 font-mono uppercase">{t.date}</p>
                               <p className="text-xs font-bold text-white">{Math.abs(t.amount).toFixed(6)} {t.ticker}</p>
                             </div>
                             <div className="text-right">
                               <p className="text-[10px] text-slate-500 font-mono">€{Math.abs(t.costEuro).toLocaleString()}</p>
                               <p className={`text-[10px] font-black ${t.amount > 0 ? 'text-green-500' : 'text-red-500'}`}>{t.amount > 0 ? 'IN' : 'OUT'}</p>
                             </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-[600px] border-2 border-dashed border-slate-800 rounded-[3rem] flex items-center justify-center text-slate-700 uppercase font-black text-[10px] tracking-[0.5em]">Select Vault Access</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniPriceChart({ coin, index, price }: any) {
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = createChart(chartRef.current, { width: 110, height: 45, layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: 'transparent' }, grid: { vertLines: { visible: false }, horzLines: { visible: false } }, rightPriceScale: { visible: false }, timeScale: { visible: false }, handleScale: false, handleScroll: false });
    const line = chart.addLineSeries({ color: coin.color, lineWidth: 2, crosshairMarkerVisible: false });
    
    const map: any = { 'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'XRP': 'ripple', 'BSC': 'binancecoin', 'DOT': 'polkadot', 'ICP': 'internet-computer' };
    const chartId = map[coin.symbol] || coin.id;

    setTimeout(() => {
      fetch(getCGUrl(`/coins/${chartId}/market_chart?vs_currency=eur&days=1`)).then(res => res.json()).then(data => {
          if (data.prices) line.setData(data.prices.map((p: any) => ({ time: p[0] / 1000, value: p[1] })));
          chart.timeScale().fitContent();
      }).catch(() => {});
    }, index * 800);
    return () => chart.remove();
  }, [coin, index]);
  return (
    <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex items-center justify-between min-w-[210px] flex-1 shadow-inner hover:scale-105 transition-transform cursor-pointer">
      <div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{coin.symbol}</p>
        <p className="text-base font-mono font-bold text-white">{price ? `€${price.toLocaleString()}` : "€..."}</p>
      </div>
      <div ref={chartRef} />
    </div>
  );
}

function StatBox({ label, value, color = "text-white" }: any) {
  return (
    <div className="bg-black/40 border border-slate-800 p-6 rounded-3xl shadow-inner animate-in fade-in duration-500">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{label}</p>
      <p className={`text-xl font-mono font-bold whitespace-nowrap ${color}`}>{value}</p>
    </div>
  );
}

function GrowthPanel({ chain }: any) {
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = createChart(chartRef.current, { width: chartRef.current.clientWidth, height: 350, layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#475569' }, grid: { vertLines: { color: '#0f172a' }, horzLines: { color: '#0f172a' } }, timeScale: { borderVisible: false }, rightPriceScale: { borderVisible: false } });
    const area = chart.addAreaSeries({ lineColor: '#3b82f6', topColor: 'rgba(59, 130, 246, 0.3)', bottomColor: 'rgba(59, 130, 246, 0)', lineWidth: 3 });
    
    const map: any = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', BSC: 'binancecoin', DOT: 'polkadot', ICP: 'internet-computer' };
    setTimeout(() => {
        fetch(getCGUrl(`/coins/${map[chain] || 'ethereum'}/market_chart?vs_currency=eur&days=30`)).then(res => res.json()).then(data => {
            if (data.prices) area.setData(data.prices.map((p: any) => ({ time: p[0] / 1000, value: p[1] })));
            chart.timeScale().fitContent();
        }).catch(() => {});
    }, 500);
    return () => chart.remove();
  }, [chain]);
  return <div ref={chartRef} className="w-full" />;
}