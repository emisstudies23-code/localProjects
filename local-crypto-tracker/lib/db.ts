import { JSONFilePreset } from 'lowdb/node';

export type Transaction = {
  id: string;
  ticker: string;     // Identifies the specific coin
  date: string;
  amount: number;
  costEuro: number;
};

export type Wallet = {
  id: number;
  label: string;
  address: string;
  chain: string;
  transactions: Transaction[];
};

type Data = { wallets: Wallet[] };

export async function getDb() {
  const defaultData: Data = { wallets: [] };
  return await JSONFilePreset<Data>('db.json', defaultData);
}