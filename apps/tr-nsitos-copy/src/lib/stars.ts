// Estrelas principais (RA, Dec em graus J2000) e linhas das constelações perto da Via Láctea
export interface Constellation { name: string; stars: Record<string, [number, number]>; lines: [string, string][] }

export const CONSTELLATIONS: Constellation[] = [
  {
    name: 'Sagitário',
    stars: { gam: [271.45, -30.42], del: [275.25, -29.83], eps: [276.04, -34.38], lam: [276.99, -25.42], phi: [281.41, -26.99], sig: [283.82, -26.3], tau: [286.74, -27.67], zet: [285.65, -29.88], eta: [274.41, -36.76] },
    lines: [['gam', 'del'], ['gam', 'eps'], ['del', 'eps'], ['del', 'lam'], ['lam', 'phi'], ['del', 'phi'], ['phi', 'sig'], ['sig', 'tau'], ['tau', 'zet'], ['zet', 'phi'], ['zet', 'eps'], ['eps', 'eta']],
  },
  {
    name: 'Escorpião',
    stars: { bet: [241.36, -19.81], del: [240.08, -22.62], pi: [239.71, -26.11], sig: [245.3, -25.59], alp: [247.35, -26.43], tau: [248.97, -28.22], eps: [252.54, -34.29], mu: [252.97, -38.05], zet: [253.65, -42.36], eta: [258.04, -43.24], the: [264.33, -43.0], iot: [266.9, -40.13], kap: [265.62, -39.03], lam: [263.4, -37.1], ups: [262.69, -37.3] },
    lines: [['bet', 'del'], ['del', 'pi'], ['del', 'sig'], ['sig', 'alp'], ['alp', 'tau'], ['tau', 'eps'], ['eps', 'mu'], ['mu', 'zet'], ['zet', 'eta'], ['eta', 'the'], ['the', 'iot'], ['iot', 'kap'], ['kap', 'lam'], ['lam', 'ups']],
  },
  {
    name: 'Ofiúco',
    stars: { alp: [263.73, 12.56], kap: [254.42, 9.38], del: [243.59, -3.69], eps: [244.58, -4.69], zet: [249.29, -10.57], eta: [257.59, -15.72], nu: [269.76, -9.77], bet: [265.87, 4.57] },
    lines: [['alp', 'kap'], ['kap', 'del'], ['del', 'eps'], ['eps', 'zet'], ['zet', 'eta'], ['eta', 'nu'], ['nu', 'bet'], ['bet', 'alp']],
  },
  {
    name: 'Águia',
    stars: { alp: [297.7, 8.87], gam: [296.56, 10.61], bet: [298.83, 6.41], del: [291.37, 3.11], zet: [286.35, 13.86], lam: [286.56, -4.88], the: [302.83, -0.82] },
    lines: [['gam', 'alp'], ['alp', 'bet'], ['alp', 'del'], ['del', 'lam'], ['del', 'zet'], ['bet', 'the']],
  },
  {
    name: 'Lira',
    stars: { alp: [279.23, 38.78], eps: [281.08, 39.67], zet: [281.19, 37.61], del: [283.6, 36.9], gam: [284.74, 32.69], bet: [282.52, 33.36] },
    lines: [['alp', 'eps'], ['alp', 'zet'], ['zet', 'del'], ['del', 'gam'], ['gam', 'bet'], ['bet', 'zet']],
  },
  {
    name: 'Cisne',
    stars: { alp: [310.36, 45.28], gam: [305.56, 40.26], eta: [299.08, 35.08], bet: [292.68, 27.96], del: [296.24, 45.13], eps: [311.55, 33.97] },
    lines: [['alp', 'gam'], ['gam', 'eta'], ['eta', 'bet'], ['del', 'gam'], ['gam', 'eps']],
  },
  {
    name: 'Cassiopeia',
    stars: { bet: [2.29, 59.15], alp: [10.13, 56.54], gam: [14.18, 60.72], del: [21.45, 60.24], eps: [28.6, 63.67] },
    lines: [['bet', 'alp'], ['alp', 'gam'], ['gam', 'del'], ['del', 'eps']],
  },
  {
    name: 'Orionte',
    stars: { bet: [78.63, -8.2], alp: [88.79, 7.41], gam: [81.28, 6.35], del: [83.0, -0.3], eps: [84.05, -1.2], zet: [85.19, -1.94], kap: [86.94, -9.67] },
    lines: [['alp', 'gam'], ['gam', 'del'], ['alp', 'zet'], ['del', 'eps'], ['eps', 'zet'], ['zet', 'kap'], ['del', 'bet']],
  },
];
