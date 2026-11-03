/**
 * Fusión a tres bandas de documentos JSON.
 *
 * Se usa cuando llegan cambios remotos (de una IA, de la API o de otra pestaña)
 * mientras hay ediciones locales sin guardar: se conservan ambas. Las listas de
 * objetos con `id` (diapositivas, elementos) se fusionan por identidad; ante un
 * conflicto en el mismo campo gana el cambio local.
 */

type Json = unknown;

export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as Json[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ao = a as Record<string, Json>;
  const bo = b as Record<string, Json>;
  const ka = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const kb = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => deepEqual(ao[k], bo[k]));
}

const isObj = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasIds = (v: Json): v is { id: string }[] =>
  Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string');

function mergeIdLists(base: { id: string }[], local: { id: string }[], remote: { id: string }[]): Json[] {
  const baseIds = new Set(base.map((x) => x.id));
  const localMap = new Map(local.map((x) => [x.id, x]));
  const remoteMap = new Map(remote.map((x) => [x.id, x]));
  const baseMap = new Map(base.map((x) => [x.id, x]));

  // Partimos del orden local (lo que el usuario está viendo) si cambió; si no, del remoto.
  const localReordered = !deepEqual(
    local.filter((x) => baseIds.has(x.id)).map((x) => x.id),
    base.filter((x) => localMap.has(x.id)).map((x) => x.id),
  );
  const order = localReordered ? local.map((x) => x.id) : remote.map((x) => x.id);
  const result: string[] = [];
  for (const id of order) {
    const inBase = baseIds.has(id);
    const inLocal = localMap.has(id);
    const inRemote = remoteMap.has(id);
    if (inBase && (!inLocal || !inRemote)) continue; // eliminado en algún lado
    if (inLocal || inRemote) result.push(id);
  }
  // Añade elementos nuevos del otro lado, junto a su vecino anterior.
  const other = localReordered ? remote : local;
  other.forEach((x, i) => {
    if (baseIds.has(x.id) || result.includes(x.id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = result.indexOf(other[j].id);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    result.splice(at, 0, x.id);
  });
  return result.map((id) => {
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    const b = baseMap.get(id);
    if (l && r) return merge3(b, l, r);
    return l ?? r;
  });
}

export function merge3<T>(base: T | undefined, local: T, remote: T): T {
  if (deepEqual(local, remote)) return local;
  if (base === undefined) return local;
  if (deepEqual(local, base)) return remote;
  if (deepEqual(remote, base)) return local;
  if (hasIds(base) && hasIds(local) && hasIds(remote)) {
    return mergeIdLists(base, local, remote) as T;
  }
  if (isObj(base) && isObj(local) && isObj(remote)) {
    const out: Record<string, Json> = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      out[k] = merge3(base[k], local[k], remote[k]);
    }
    return out as T;
  }
  return local; // conflicto en un valor: gana lo local
}
