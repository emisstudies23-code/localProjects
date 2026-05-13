"use server";
import { getDb, Wallet, Transaction } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function saveWallet(label: string, address: string, chain: string) {
  const db = await getDb();
  db.data.wallets.push({ id: Date.now(), label, address, chain, transactions: [] });
  await db.write();
  revalidatePath('/');
}

export async function addTransaction(walletId: number, ticker: string, amount: number, costEuro: number, date: string) {
  const db = await getDb();
  const wallet = db.data.wallets.find(w => w.id === walletId);
  if (wallet) {
    wallet.transactions.push({ id: Math.random().toString(), ticker, date, amount, costEuro });
    await db.write();
  }
  revalidatePath('/');
}

export async function deleteWallet(id: number) {
  const db = await getDb();
  db.data.wallets = db.data.wallets.filter(w => w.id !== id);
  await db.write();
  revalidatePath('/');
}

export async function fetchWallets() {
  const db = await getDb();
  return db.data.wallets;
}