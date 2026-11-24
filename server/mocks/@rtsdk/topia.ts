/**
 * In-memory fake of @rtsdk/topia for route tests. Stateful: data objects support dot-path updates,
 * locks behave like the platform (a held lock id rejects the next writer), and dropped assets can be
 * looked up by unique name. Tests drive it through `__store`.
 */
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

const setPath = (obj: any, path: string, value: any) => {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== "object" || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = clone(value);
};

export interface FakeAsset {
  id: string;
  uniqueName: string;
  topLayerURL: string;
  position: { x: number; y: number };
  updateWebImageLayers: jest.Mock;
}

const freshStore = () => ({
  worlds: {} as Record<string, any>,
  visitors: {} as Record<string, any>,
  locks: new Set<string>(),
  assets: {} as Record<string, FakeAsset[]>,
  inventoryItems: [] as any[],
  owned: {} as Record<string, string[]>,
  admins: new Set<string>(),
  worldToasts: [] as any[],
  visitorToasts: [] as any[],
  particles: [] as any[],
  analytics: [] as any[],
  /** Runs before every world updateDataObject (simulate a concurrent writer). */
  beforeWorldUpdate: null as null | ((slug: string) => void),
});

export const __store = freshStore();

export const resetStore = () => Object.assign(__store, freshStore());

const takeLock = (opts: any) => {
  const lock = opts?.lock;
  if (!lock?.lockId) return () => undefined;
  if (__store.locks.has(lock.lockId)) throw new Error(`Lock ${lock.lockId} is held`);
  __store.locks.add(lock.lockId);
  return () => {
    if (lock.releaseLock) __store.locks.delete(lock.lockId);
  };
};

const record = (opts: any) => {
  if (opts?.analytics) __store.analytics.push(...opts.analytics);
};

export const addAsset = (slug: string, uniqueName: string, topLayerURL = "https://art/transparent.png"): FakeAsset => {
  const asset: FakeAsset = {
    id: `${uniqueName}-${Math.random().toString(36).slice(2, 7)}`,
    uniqueName,
    topLayerURL,
    position: { x: 10, y: 20 },
    updateWebImageLayers: jest.fn(async function (this: FakeAsset, _bottom: string, top: string) {
      asset.topLayerURL = top;
    }),
  };
  (__store.assets[slug] ||= []).push(asset);
  return asset;
};

class FakeWorld {
  dataObject: any;
  constructor(public urlSlug: string) {}
  async fetchDataObject() {
    this.dataObject = clone(__store.worlds[this.urlSlug]);
    return this.dataObject;
  }
  async setDataObject(data: any, opts?: any) {
    const release = takeLock(opts);
    __store.worlds[this.urlSlug] = clone(data);
    record(opts);
    release();
  }
  async updateDataObject(patch: any, opts?: any) {
    __store.beforeWorldUpdate?.(this.urlSlug);
    const release = takeLock(opts);
    const target = (__store.worlds[this.urlSlug] ||= {});
    for (const [k, v] of Object.entries(patch)) setPath(target, k, v);
    record(opts);
    release();
  }
  async fetchDroppedAssetsWithUniqueName({ uniqueName, isPartial }: { uniqueName: string; isPartial?: boolean }) {
    return (__store.assets[this.urlSlug] || []).filter((a) =>
      isPartial ? a.uniqueName.includes(uniqueName) : a.uniqueName === uniqueName,
    );
  }
  async triggerParticle(args: any) {
    __store.particles.push(args);
    return { success: true };
  }
  async fireToast(args: any) {
    __store.worldToasts.push(args);
  }
}

class FakeVisitor {
  dataObject: any;
  inventoryItems: any[] = [];
  isAdmin: boolean;
  constructor(public id: number, public urlSlug: string, public profileId: string) {
    this.isAdmin = __store.admins.has(profileId);
  }
  async fetchDataObject() {
    this.dataObject = clone(__store.visitors[this.profileId]);
    return this.dataObject;
  }
  async setDataObject(data: any, opts?: any) {
    const release = takeLock(opts);
    __store.visitors[this.profileId] = clone(data);
    record(opts);
    release();
  }
  async updateDataObject(patch: any, opts?: any) {
    const release = takeLock(opts);
    const target = (__store.visitors[this.profileId] ||= {});
    for (const [k, v] of Object.entries(patch)) setPath(target, k, v);
    record(opts);
    release();
  }
  async fetchInventoryItems() {
    this.inventoryItems = (__store.owned[this.profileId] || []).map((name) => ({
      id: `ui-${name}`,
      status: "ACTIVE",
      item: { name, type: "BADGE" },
    }));
  }
  async grantInventoryItem(item: any) {
    (__store.owned[this.profileId] ||= []).push(item.name);
    return { id: `ui-${item.name}` };
  }
  async fireToast(args: any) {
    __store.visitorToasts.push({ profileId: this.profileId, ...args });
  }
}

export class Topia {
  constructor(_opts: any) {}
}

export class AssetFactory {
  constructor(_topia: any) {}
}

export class DroppedAssetFactory {
  constructor(_topia: any) {}
}

export class UserFactory {
  constructor(_topia: any) {}
}

export class WorldActivityFactory {
  constructor(_topia: any) {}
}

export class EcosystemFactory {
  constructor(_topia: any) {}
  create() {
    return {
      inventoryItems: [] as any[],
      async fetchInventoryItems() {
        this.inventoryItems = clone(__store.inventoryItems);
      },
    };
  }
}

export class VisitorFactory {
  constructor(_topia: any) {}
  async get(visitorId: number, urlSlug: string, { credentials }: any) {
    return new FakeVisitor(visitorId, urlSlug, credentials.profileId);
  }
  async create(visitorId: number, urlSlug: string, { credentials }: any) {
    return new FakeVisitor(visitorId, urlSlug, credentials.profileId);
  }
}

export class WorldFactory {
  constructor(_topia: any) {}
  create(slug: string) {
    return new FakeWorld(slug);
  }
}

export const __mock = { store: __store, reset: resetStore, addAsset };
