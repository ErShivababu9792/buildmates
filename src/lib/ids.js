/** Same id for a pair no matter who starts: used for chats. */
export function pairId(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** Directional ids: "from_to". Used for requests and blocks. */
export function edgeId(from, to) {
  return `${from}_${to}`;
}

export function otherMember(members, me) {
  return members[0] === me ? members[1] : members[0];
}
