import { DEG, Vec, LatLon, sub, norm, dot, cross, len, rayEarth, ecefToGeodetic, haversineKm, bearingDeg } from './geo';

/** Fração do raio do disco até à qual uma passagem ainda é boa para fotografar (2/3). */
export const OFFSET_FRAC = 2 / 3;

export interface OffsetBand {
  /** Ponto do chão onde o objeto passa no centro do disco. */
  centre: LatLon;
  /** Ponto onde o objeto passa a OFFSET_FRAC do raio ABAIXO do centro (mais perto do horizonte). */
  below: LatLon;
  /** Idem, ACIMA do centro. */
  above: LatLon;
  /** Meia-largura da faixa utilizável (m), do centro a cada limite. */
  halfWidthM: number;
  /** Rumo do centro para o limite "abaixo". */
  belowBrg: number;
  /** Tempo no disco (s) a passar no centro e a passar no limite da faixa. */
  discCentreS: number;
  discEdgeS: number;
}

/**
 * Faixa de locais no chão de onde o objeto passa a menos de `frac` do raio do disco.
 * pe = posição do objeto (ECEF, km); vel = velocidade (ECEF, km/s); be = posição do Sol/Lua (ECEF, km);
 * up = vertical do local (ECEF normalizado).
 */
export function offsetBand(pe: Vec, vel: Vec, be: Vec, radiusDeg: number, up: Vec, frac = OFFSET_FRAC): OffsetBand | null {
  const u = norm(sub(be, pe));
  const vp: Vec = [vel[0] - dot(vel, u) * u[0], vel[1] - dot(vel, u) * u[1], vel[2] - dot(vel, u) * u[2]];
  const speed = len(vp);
  if (speed < 1e-9) return null;
  const m: Vec = [vp[0] / speed, vp[1] / speed, vp[2] / speed];
  let n = norm(cross(u, m)); // perpendicular ao movimento aparente, no plano do céu
  if (dot(n, up) > 0) n = [-n[0], -n[1], -n[2]]; // n aponta para baixo (horizonte)
  const d = frac * radiusDeg * DEG;
  const [c, s] = [Math.cos(d), Math.sin(d)];
  const ground = (sign: number): LatLon | null => {
    const w: Vec = norm([u[0] * c + sign * n[0] * s, u[1] * c + sign * n[1] * s, u[2] * c + sign * n[2] * s]);
    const g = rayEarth(pe, [-w[0], -w[1], -w[2]]);
    return g ? ecefToGeodetic(g) : null;
  };
  const gc = rayEarth(pe, [-u[0], -u[1], -u[2]]);
  const below = ground(1), above = ground(-1);
  if (!gc || !below || !above) return null;
  const centre = ecefToGeodetic(gc);
  const angSpeed = speed / len(sub(pe, gc)); // rad/s
  const r = radiusDeg * DEG;
  return {
    centre, below, above,
    halfWidthM: ((haversineKm(centre, below) + haversineKm(centre, above)) / 2) * 1000,
    belowBrg: bearingDeg(centre, below),
    discCentreS: (2 * r) / angSpeed,
    discEdgeS: (2 * r * Math.sqrt(1 - frac * frac)) / angSpeed,
  };
}
