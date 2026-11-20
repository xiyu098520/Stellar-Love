import type { GiftEntry, Item, MoneyEntry, Wallet, World } from './types';

const KEY = 'sl.wallet.';

export function emptyWallet(world?: World | null): Wallet {
  return {
    money: Number(world?.initialMoney ?? 0) || 0,
    coins: 0,
    inventory: {},
    ledger: [],
    gifts: [],
    unlocked: [],
  };
}

export function loadWallet(worldId: string, world?: World | null): Wallet {
  if (typeof window === 'undefined') return emptyWallet(world);
  try {
    const raw = localStorage.getItem(KEY + worldId);
    if (!raw) return emptyWallet(world);
    const w = JSON.parse(raw) as Partial<Wallet>;
    return {
      money: Number(w?.money ?? 0) || 0,
      coins: Number(w?.coins ?? 0) || 0,
      inventory: w?.inventory || {},
      ledger: Array.isArray(w?.ledger) ? w.ledger : [],
      gifts: Array.isArray(w?.gifts) ? w.gifts : [],
      unlocked: Array.isArray(w?.unlocked) ? w.unlocked : [],
    };
  } catch {
    return emptyWallet(world);
  }
}

export function saveWallet(worldId: string, wallet: Wallet): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY + worldId, JSON.stringify(wallet));
  } catch {
    /* 存不下就保持现状，钱丢了也比整页崩掉好 */
  }
}

/** 记录一笔钱：正收入、负支出；余额跟着变 */
export function applyMoney(
  wallet: Wallet,
  amount: number,
  meta: { reason: string; who?: string; time?: string; place?: string; turnIndex?: number },
): Wallet {
  const value = Math.round(Number(amount) || 0);
  if (!value) return wallet;
  const entry: MoneyEntry = {
    id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
    turnIndex: meta.turnIndex ?? 0,
    time: meta.time,
    place: meta.place,
    amount: value,
    reason: meta.reason || (value > 0 ? '收入' : '支出'),
    who: meta.who,
  };
  return {
    ...wallet,
    money: wallet.money + value,
    ledger: [...wallet.ledger, entry],
  };
}

/** 一回合的抽卡币 */
export function earnCoins(wallet: Wallet, n = 100): Wallet {
  return { ...wallet, coins: wallet.coins + Math.max(0, Math.round(n) || 0) };
}

export function spendCoins(wallet: Wallet, n: number): Wallet | null {
  if (wallet.coins < n) return null;
  return { ...wallet, coins: wallet.coins - n };
}

export function addItem(wallet: Wallet, itemId: string, qty = 1): Wallet {
  const next = { ...wallet.inventory, [itemId]: (wallet.inventory[itemId] || 0) + qty };
  return { ...wallet, inventory: next };
}

export function removeItem(wallet: Wallet, itemId: string, qty = 1): Wallet | null {
  const have = wallet.inventory[itemId] || 0;
  if (have < qty) return null;
  const next = { ...wallet.inventory };
  if (have - qty <= 0) delete next[itemId];
  else next[itemId] = have - qty;
  return { ...wallet, inventory: next };
}

/** 买一件：钱够就扣钱、入库 */
export function buyItem(
  wallet: Wallet,
  item: Item,
  meta: { time?: string; place?: string; turnIndex?: number },
): Wallet | null {
  const price = Math.max(0, Math.round(item.price || 0));
  if (wallet.money < price) return null;
  let next = wallet;
  if (price > 0) {
    next = applyMoney(next, -price, { ...meta, reason: `买了${item.name}` });
  }
  return addItem(next, item.id, 1);
}

/** 送出一件：从背包扣掉，记到他名下 */
export function giftItem(
  wallet: Wallet,
  item: Item,
  characterId: string,
  characterName: string,
  meta: { time?: string; line: 'main' | 'route'; saveId: string; memorable?: boolean },
): Wallet | null {
  const spent = removeItem(wallet, item.id, 1);
  if (!spent) return null;
  const entry: GiftEntry = {
    id: `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    characterId,
    characterName,
    itemId: item.id,
    itemName: item.name,
    at: Date.now(),
    time: meta.time,
    line: meta.line,
    saveId: meta.saveId,
    memorable: meta.memorable ?? item.kind !== 'daily',
  };
  return { ...spent, gifts: [...spent.gifts, entry] };
}

/** 剧本里删掉或改名的物品，背包照样按 id 找；找不到时给个占位名 */
export function itemOf(world: World | null, id: string): Item | undefined {
  return (world?.items || []).find(i => i.id === id);
}
