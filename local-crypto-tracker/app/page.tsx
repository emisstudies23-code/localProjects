"use client";
import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { Plus, Trash2, Calendar, Tag, FileUp, Wallet } from 'lucide-react';
import Papa from 'papaparse'; 
import { saveWallet, fetchWallets, deleteWallet, addTransaction } from './actions';

// --- CONFIGURATION ---
const HEADER_COINS = [
  { id: 'bitcoin', symbol: 'BTC', color: '#f7931a' },
  { id: 'ethereum', symbol: 'ETH', color: '#627eea' },
  { id: 'solana', symbol: 'SOL', color: '#14f195' },
  { id: 'ripple', symbol: 'XRP', color: '#23292f' },
];

const SUPPORTED_CHAINS = ["ETH", "SOL", "BTC", "XRP", "LTC", "DOT", "AAVE", "OP"];

export default function UniversalTracker() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [activeWallet, setActiveWallet] = useState<any>(null);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({ USDC: 1, USDT: 1, DAI: 1 });
  
  const [label, setLabel] = useState("");
  const [chain, setChain] = useState("ETH");
  const [tTicker, setTTicker] = useState("");
  const [tAmount, setTAmount] = useState("");
  const [tCost, setTCost] = useState("");
  const [tDate, setTDate] = useState("");

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
    if (activeWallet) {
      const updated = data.find((w: any) => w.id === activeWallet.id);
      if (updated) setActiveWallet(updated);
    }
  };

  const fetchMarketPrices = async () => {
    try {
      // Primary Source: CoinGecko (Proven to work on your network)
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,compound-governance-token,usd-coin,dai,tether&vs_currencies=eur`);
      if (!res.ok) throw new Error("Throttled");
      const data = await res.json();
      setLivePrices(prev => ({
        ...prev,
        BTC: data.bitcoin.eur,
        ETH: data.ethereum.eur,
        SOL: data.solana.eur,
        XRP: data.ripple.eur,
        COMP: data['compound-governance-token']?.eur || 0,
        USDC: data['usd-coin'].eur,
        DAI: data.dai.eur,
        USDT: data.tether.eur
      }));
    } catch (e) {
      // Fallback: CryptoCompare
      try {
        const res = await fetch(`https://min-api.cryptocompare.com/api/data/pricemulti?fsyms=BTC,ETH,SOL,XRP,USDC,USDT,DAI,COMP&tsyms=EUR`);
        const data = await res.json();
        const fallback: any = {};
        Object.keys(data).forEach(k => fallback[k] = data[k].EUR);
        setLivePrices(prev => ({ ...prev, ...fallback }));
      } catch (err) {}
    }
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
          
          // CRITICAL FIX: Include FEES to match Ledger's 1.505331 balance
          // Fees reduce your ETH quantity, so they must be -1 multiplier
          const isReduction = type === 'OUT' || type === 'FEES' || type === 'SEND';
          const multiplier = isReduction ? -1 : 1;

          if (ticker && Math.abs(amount) >= 0.00001) {
            await addTransaction(activeWallet.id, ticker, amount * multiplier, cost * multiplier, row['Operation Date']?.split('T')[0] || "");
          }
        }
        refreshData();
        alert("Ledger Vault Synced: Balance Adjusted for Fees.");
      }
    });
  };

  const handleManualAdd = async () => {
    if (!activeWallet || !tAmount || !tCost || !tDate || !tTicker) return;
    await addTransaction(activeWallet.id, tTicker.toUpperCase(), Number(tAmount), Number(tCost), tDate);
    setTAmount(""); setTCost(""); setTDate(""); refreshData();
  };

  const balances = activeWallet?.transactions?.reduce((acc: any, t: any) => {
    acc[t.ticker] = (acc[t.ticker] || 0) + t.amount;
    return acc;
  }, {}) || {};

  const isPricesLoaded = livePrices[activeWallet?.chain] !== undefined;
  const totalValue = isPricesLoaded ? Object.entries(balances).reduce((acc: number, [tick, qty]: any) => acc + (qty * (livePrices[tick] || 0)), 0) : 0;
  const netInvested = activeWallet?.transactions?.reduce((acc: number, t: any) => acc + t.costEuro, 0) || 0;
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
              <button onClick={async () => { await saveWallet(label, "OFFLINE_VAULT", chain); setLabel(""); refreshData(); }} className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg">Initialize</button>
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
                  <button onClick={(e) => { e.stopPropagation(); deleteWallet(w.id); refreshData(); }} className="text-slate-800 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
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
                      <StatBox label="Net Invested" value={`€${netInvested.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                      <StatBox label="Portfolio Value" value={isPricesLoaded ? `€${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'Calculating...'} color="text-blue-400" />
                      <StatBox label="Total P/L" value={isPricesLoaded ? `${profitLoss >= 0 ? '+€' : '-€'}${Math.abs(profitLoss).toLocaleString()}` : '...'} color={profitLoss >= 0 ? 'text-green-500' : 'text-red-500'} />
                      <StatBox label="% Growth" value={isPricesLoaded ? `${netInvested !== 0 ? ((profitLoss / netInvested) * 100).toFixed(2) : '0.00'}%` : '...'} color={profitLoss >= 0 ? 'text-green-500' : 'text-red-500'} />
                   </div>

                   <div className="mb-10 bg-black/20 p-6 rounded-3xl border border-slate-800">
                      <h3 className="text-[10px] font-black uppercase text-slate-500 mb-4 tracking-widest">Asset Allocation Breakdown</h3>
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
                               <span className="text-right text-slate-500 italic">€{isPricesLoaded && livePrices[tick] ? livePrices[tick].toLocaleString() : "..."}</span>
                               <span className="text-right text-white font-bold">
                                €{isPricesLoaded && livePrices[tick] ? (qty * livePrices[tick]).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "..."}
                               </span>
                             </div>
                           )
                        ))}
                      </div>
                   </div>
                   <GrowthPanel chain={activeWallet.chain} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem]">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Add Manual Entry</h3>
                      <label className="flex items-center gap-2 bg-blue-600/10 text-blue-400 px-3 py-1.5 rounded-xl text-[9px] font-black cursor-pointer hover:bg-blue-600 hover:text-white transition-all shadow-lg active:scale-95">
                        <FileUp size={14} /> BULK CSV
                        <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
                      </label>
                    </div>
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <select className="flex-1 bg-black border border-slate-800 p-4 rounded-2xl text-xs outline-none focus:border-blue-500" value={tTicker} onChange={e => setTTicker(e.target.value)}>
                          <option value={activeWallet.chain}>{activeWallet.chain}</option>
                          <option value="USDC">USDC</option>
                        </select>
                        <input type="date" className="flex-1 bg-black border border-slate-800 p-4 rounded-2xl text-xs outline-none" value={tDate} onChange={e => setTDate(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <input type="number" className="w-full bg-black border border-slate-800 p-4 rounded-2xl text-xs outline-none focus:border-blue-500" placeholder="Qty" value={tAmount} onChange={e => setTAmount(e.target.value)} />
                        <input type="number" className="w-full bg-black border border-slate-800 p-4 rounded-2xl text-xs outline-none focus:border-blue-500" placeholder="Total €" value={tCost} onChange={e => setTCost(e.target.value)} />
                      </div>
                      <button onClick={handleManualAdd} className="w-full bg-blue-600/10 text-blue-500 border border-blue-600/20 hover:bg-blue-600 hover:text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Add Record</button>
                    </div>
                  </div>

                  <div className="bg-slate-900/10 border border-slate-800 rounded-[2.5rem] p-8 max-h-[420px] overflow-y-auto no-scrollbar">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 font-mono">Vault Ledger</h3>
                    <div className="space-y-3">
                      {activeWallet.transactions?.sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((t: any) => (
                        <div key={t.id} className="flex justify-between items-center p-4 bg-black/30 border border-slate-800 rounded-2xl group hover:border-blue-500/50 transition-all">
                             <div>
                               <p className="text-[9px] text-slate-600 font-mono uppercase">{t.date}</p>
                               <p className="text-xs font-bold text-white">{t.amount.toFixed(6)} {t.ticker}</p>
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
    const delay = index * 800; // Space out requests to avoid 429 errors
    setTimeout(() => {
      fetch(`https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=eur&days=1`).then(res => res.json()).then(data => {
          if (data.prices) line.setData(data.prices.map((p: any) => ({ time: p[0] / 1000, value: p[1] })));
          chart.timeScale().fitContent();
      }).catch(() => {});
    }, delay);
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
    const map: any = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple' };
    setTimeout(() => {
        fetch(`https://api.coingecko.com/api/v3/coins/${map[chain] || 'ethereum'}/market_chart?vs_currency=eur&days=30`).then(res => res.json()).then(data => {
            if (data.prices) area.setData(data.prices.map((p: any) => ({ time: p[0] / 1000, value: p[1] })));
            chart.timeScale().fitContent();
        }).catch(() => {});
    }, 500);
    return () => chart.remove();
  }, [chain]);
  return <div ref={chartRef} className="w-full" />;
}