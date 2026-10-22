/**
 * KiCad netlist parser + footprint mapping.
 *
 * Pure and DOM-free so it runs in the engine seam / Node tests without a
 * browser. Supports the two formats KiCad exports:
 *   - XML intermediate netlist (what BOM tools consume)
 *   - the default ".net" S-expression netlist (Eeschema → Export Netlist)
 * `parseNetlist` auto-detects which one it was given.
 */

export interface NetlistComponent {
  ref: string;
  value: string;
  /** Raw KiCad footprint string, e.g. "Package_DIP:DIP-8_W7.62mm" (may be empty). */
  footprint: string;
}

export interface NetlistNet {
  name: string;
  nodes: { ref: string; pin: string }[];
}

export interface ParsedNetlist {
  components: NetlistComponent[];
  nets: NetlistNet[];
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : undefined;
}

function firstTagText(block: string, tag: string): string {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(block);
  return m ? m[1].trim() : "";
}

/** Parse a KiCad XML netlist string into components + nets. Throws on clearly-wrong input. */
export function parseKicadXmlNetlist(xml: string): ParsedNetlist {
  if (!/<export\b/.test(xml) || !/<nets\b/.test(xml)) {
    throw new Error("parseKicadXmlNetlist: not a KiCad XML netlist (missing <export>/<nets>)");
  }

  const components: NetlistComponent[] = [];
  const compRe = /<comp\b([^>]*)>([\s\S]*?)<\/comp>/g;
  let m: RegExpExecArray | null;
  while ((m = compRe.exec(xml))) {
    const ref = attr(m[1], "ref");
    if (!ref) continue;
    components.push({
      ref,
      value: firstTagText(m[2], "value"),
      footprint: firstTagText(m[2], "footprint"),
    });
  }

  const nets: NetlistNet[] = [];
  const netRe = /<net\b([^>]*)>([\s\S]*?)<\/net>/g;
  while ((m = netRe.exec(xml))) {
    const name = attr(m[1], "name") ?? attr(m[1], "code") ?? "";
    const nodes: { ref: string; pin: string }[] = [];
    const nodeRe = /<node\b([^>]*)\/?>/g;
    let nm: RegExpExecArray | null;
    while ((nm = nodeRe.exec(m[2]))) {
      const ref = attr(nm[1], "ref");
      const pin = attr(nm[1], "pin");
      if (ref && pin) nodes.push({ ref, pin });
    }
    if (nodes.length > 0) nets.push({ name, nodes });
  }

  return { components, nets };
}

// ---- S-expression (.net) netlist ----

type SExpr = string | SExpr[];

/** Parse an S-expression string into nested arrays / tokens. */
function parseSExpr(src: string): SExpr {
  let i = 0;
  const n = src.length;
  function parse(): SExpr {
    skipWs();
    if (src[i] === "(") {
      i++; // consume '('
      const list: SExpr[] = [];
      for (;;) {
        skipWs();
        if (i >= n) throw new Error("parseSExpr: unexpected end of input");
        if (src[i] === ")") {
          i++;
          return list;
        }
        list.push(parse());
      }
    }
    return atom();
  }
  function skipWs() {
    while (i < n && /\s/.test(src[i])) i++;
  }
  function atom(): string {
    if (src[i] === '"') {
      i++; // opening quote
      let s = "";
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < n) i++; // skip escape char
        s += src[i++];
      }
      i++; // closing quote
      return s;
    }
    let s = "";
    while (i < n && !/[\s()]/.test(src[i])) s += src[i++];
    return s;
  }
  skipWs();
  if (src[i] !== "(") throw new Error("parseSExpr: expected '('");
  return parse();
}

function isList(x: SExpr): x is SExpr[] {
  return Array.isArray(x);
}

/** First child list whose head matches `head`. */
function child(node: SExpr[], head: string): SExpr[] | undefined {
  return node.find((c): c is SExpr[] => isList(c) && c[0] === head);
}

/** All child lists whose head matches `head`. */
function children(node: SExpr[], head: string): SExpr[][] {
  return node.filter((c): c is SExpr[] => isList(c) && c[0] === head);
}

/** Value of a `(head value)` child, as a string. */
function childValue(node: SExpr[], head: string): string {
  const c = child(node, head);
  return c && typeof c[1] === "string" ? c[1] : "";
}

/** Parse a KiCad ".net" S-expression netlist. Throws on clearly-wrong input. */
export function parseKicadNetNetlist(src: string): ParsedNetlist {
  if (!/\(\s*export\b/.test(src) || !/\(\s*nets\b/.test(src)) {
    throw new Error("parseKicadNetNetlist: not a KiCad .net netlist (missing (export)/(nets))");
  }
  const root = parseSExpr(src);
  if (!isList(root) || root[0] !== "export") throw new Error("parseKicadNetNetlist: missing (export)");

  const compsNode = child(root, "components") ?? [];
  const components: NetlistComponent[] = [];
  for (const comp of children(compsNode, "comp")) {
    const ref = childValue(comp, "ref");
    if (!ref) continue;
    components.push({ ref, value: childValue(comp, "value"), footprint: childValue(comp, "footprint") });
  }

  const netsNode = child(root, "nets") ?? [];
  const nets: NetlistNet[] = [];
  for (const net of children(netsNode, "net")) {
    const name = childValue(net, "name") || childValue(net, "code");
    const nodes: { ref: string; pin: string }[] = [];
    for (const nd of children(net, "node")) {
      const ref = childValue(nd, "ref");
      const pin = childValue(nd, "pin");
      if (ref && pin) nodes.push({ ref, pin });
    }
    if (nodes.length > 0) nets.push({ name, nodes });
  }

  return { components, nets };
}

// ---- OrcadPCB2 (.net) netlist (KiCad "OrcadPCB2" export tab) ----

/**
 * Parse the OrcadPCB2 netlist KiCad exports from the OrcadPCB2 tab. Structure:
 *
 *   ( { Eeschema Netlist Version 1.1 ... }
 *    ( <tstamp> <footprint> <ref> <value>
 *      ( <pad> <netname> )
 *      ... )
 *    ... )
 *
 * Net membership is implicit: each pad lists the net it's on, so we group pads
 * by net name across all components.
 */
export function parseOrcadPcb2Netlist(src: string): ParsedNetlist {
  // Strip the { ... } header/comment blocks so the rest is a clean S-expression.
  const cleaned = src.replace(/\{[^{}]*\}/g, " ");
  const root = parseSExpr(cleaned);
  if (!isList(root)) throw new Error("parseOrcadPcb2Netlist: expected a list");

  const components: NetlistComponent[] = [];
  const netMap = new Map<string, { ref: string; pin: string }[]>();

  for (const comp of root) {
    if (!isList(comp) || comp.length < 4) continue;
    const [, footprint, ref, value] = comp;
    if (typeof ref !== "string" || typeof footprint !== "string") continue;
    components.push({
      ref,
      value: typeof value === "string" ? value : "",
      footprint: footprint === "$noname" ? "" : footprint,
    });
    for (let i = 4; i < comp.length; i++) {
      const node = comp[i];
      if (isList(node) && typeof node[0] === "string" && typeof node[1] === "string") {
        const [pin, net] = node;
        const arr = netMap.get(net) ?? [];
        arr.push({ ref, pin });
        netMap.set(net, arr);
      }
    }
  }

  if (components.length === 0) throw new Error("parseOrcadPcb2Netlist: no components found");
  const nets: NetlistNet[] = Array.from(netMap, ([name, nodes]) => ({ name, nodes }));
  return { components, nets };
}

/** Auto-detect the netlist format (KiCad XML / KiCad S-expr / OrcadPCB2) and parse. */
export function parseNetlist(src: string): ParsedNetlist {
  const trimmed = src.trimStart();
  if (trimmed.startsWith("<")) return parseKicadXmlNetlist(src);
  if (trimmed.startsWith("(")) {
    if (/\(\s*export\b/.test(src)) return parseKicadNetNetlist(src);
    return parseOrcadPcb2Netlist(src); // OrcadPCB2 has no (export ...) head
  }
  throw new Error("parseNetlist: unrecognised netlist format (expected KiCad XML, .net, or OrcadPCB2)");
}

/**
 * Best-effort map from a raw KiCad footprint string to a library footprint name.
 * Returns undefined when nothing matches (caller falls back to a generic part).
 */
export function mapKicadFootprint(raw: string): string | undefined {
  const s = raw.toLowerCase();
  if (/dip-?16/.test(s)) return "DIP-16";
  if (/dip-?14/.test(s)) return "DIP-14";
  if (/dip-?8/.test(s)) return "DIP-8";
  if (/esp32/.test(s)) return "ESP32_DEVKIT";
  if (/to-?220/.test(s)) return "TO-220";
  if (/terminalblock|screw/.test(s)) return "SCREW_2";
  if (/pinheader_1x02|pinheader.*1x2|conn_01x02/.test(s)) return "PINHDR_1x2";
  if (/pinheader_1x04|pinheader.*1x4|conn_01x04/.test(s)) return "PINHDR_1x4";
  if (/(^|[^a-z])r_axial|resistor/.test(s)) return "R_AXIAL_0.4";
  if (/c_disc|capacitor|c_axial/.test(s)) return "C_DISC_0.2";
  if (/(^|[^a-z])d_|diode/.test(s)) return "DIODE_0.4";
  return undefined;
}
