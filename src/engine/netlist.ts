/**
 * KiCad XML intermediate netlist parser + footprint mapping.
 *
 * Pure and DOM-free (regex over the known KiCad structure) so it runs in the
 * engine seam / Node tests without a browser. v1 supports exactly one format:
 * the XML netlist Eeschema exports (the one BOM tools consume).
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
