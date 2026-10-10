// Pruebas de Borda y Copeland (lib/aggregateRanking.ts) con rankings pequeños calculados a mano.
import { aggregateRanking, describeAggregationRule } from '../src/lib/aggregateRanking.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const M = (key: string, ranks: number[]) => ({ key, label: key, ranks });
const N = ['A', 'B', 'C'];
const scoreOf = (r: ReturnType<typeof aggregateRanking>, name: string) => r!.rows.find((x) => x.name === name)!;
const line = (r: NonNullable<ReturnType<typeof aggregateRanking>>) => r.rows.map((x) => x.name + ':' + x.score).join();

// 1) Sin empates. m1: A>B>C; m2: A>C>B; m3: B>A>C.
//    Borda (n=3: 2/1/0): A = 2+2+1 = 5, B = 1+0+2 = 3, C = 0+1+0 = 1.
//    Copeland: A–B 2-1 → A; A–C 3-0 → A; B–C 2-1 → B ⇒ A = +2, B = 0, C = −2. A es ganador de Condorcet.
{
  const ms = [M('m1', [1, 2, 3]), M('m2', [1, 3, 2]), M('m3', [2, 1, 3])];
  const b = aggregateRanking(N, ms, 'borda')!;
  ok(line(b) === 'A:5,B:3,C:1', 'Borda: A 5, B 3, C 1 → ' + line(b));
  ok(b.winners.join() === 'A' && !b.hasTie && b.condorcetWinner === 'A' && !b.cycle, 'Borda: gana A, sin empates, Condorcet = A, sin ciclo');
  const c = aggregateRanking(N, ms, 'copeland')!;
  ok(line(c) === 'A:2,B:0,C:-2', 'Copeland: A +2, B 0, C −2 → ' + line(c));
  ok(c.wins[0][1] === 2 && c.wins[1][0] === 1 && c.wins[0][2] === 3, 'matriz de duelos: A>B 2 a 1, A>C 3 a 0');
}

// 2) Paradoja de Condorcet: m1 A>B>C, m2 B>C>A, m3 C>A>B. A gana a B (2-1), B a C (2-1), C a A (2-1): ciclo.
//    Borda: cada una suma 2+1+0 = 3 → empate triple. Copeland: 0 para todas → empate triple. Sin ganador de Condorcet.
{
  const ms = [M('m1', [1, 2, 3]), M('m2', [3, 1, 2]), M('m3', [2, 3, 1])];
  for (const rule of ['borda', 'copeland'] as const) {
    const r = aggregateRanking(N, ms, rule)!;
    ok(r.cycle && r.condorcetWinner === null, `${rule}: paradoja de Condorcet detectada (ciclo, sin ganador de Condorcet)`);
    ok(r.hasTie && r.winners.length === 3 && r.rows.every((x) => x.rank === 1 && x.tied), `${rule}: empate triple declarado, los tres en el puesto 1`);
  }
  ok(scoreOf(aggregateRanking(N, ms, 'borda'), 'A').score === 3, 'Borda: cada alternativa suma 3');
}

// 3) Empate DENTRO de un método. m1: A=1, B=C=2 (puestos promedio 1, 2.5, 2.5); m2: A>C>B.
//    Borda: m1 → A 2, B 0.5, C 0.5; m2 → A 2, B 0, C 1 ⇒ A 4, C 1.5, B 0.5.
//    Copeland: A–B A, A–C A, B–C: m1 se abstiene, m2 C ⇒ A +2, C 0, B −2.
{
  const ms = [M('m1', [1, 2, 2]), M('m2', [1, 3, 2])];
  const b = aggregateRanking(N, ms, 'borda')!;
  ok(line(b) === 'A:4,C:1.5,B:0.5', 'Borda con empate interno: A 4, C 1.5, B 0.5 → ' + line(b));
  const c = aggregateRanking(N, ms, 'copeland')!;
  ok(line(c) === 'A:2,C:0,B:-2', 'Copeland: el método que empata B–C se abstiene → A +2, C 0, B −2');
}

// 4) Empate en el orden agregado. Dos métodos que invierten A,B: Borda 1–1, Copeland 0–0; puestos 1, 1.
{
  const ms = [M('m1', [1, 2]), M('m2', [2, 1])];
  const b = aggregateRanking(['A', 'B'], ms, 'borda')!;
  ok(b.hasTie && b.winners.join() === 'A,B' && b.rows.every((r) => r.rank === 1), 'orden agregado empatado: ambas en el puesto 1, no se desempata');
  ok(b.rows.map((r) => r.name).join() === 'A,B', 'el orden de salida de un empate conserva el orden de entrada');
}

// 5) Borda y Copeland pueden discrepar. m1 y m2: A>B>C; m3: B>C>A.
//    Borda: A = 2+2+0 = 4, B = 1+1+2 = 4, C = 0+0+1 = 1 ⇒ empate A–B. Copeland: A–B 2-1 → A; A–C 2-1 → A; B–C 3-0 → B ⇒ A +2, B 0, C −2.
{
  const ms = [M('m1', [1, 2, 3]), M('m2', [1, 2, 3]), M('m3', [3, 1, 2])];
  const b = aggregateRanking(N, ms, 'borda')!;
  const c = aggregateRanking(N, ms, 'copeland')!;
  ok(b.winners.join() === 'A,B' && b.hasTie, 'Borda empata A y B en la cima (4 y 4)');
  ok(c.winners.join() === 'A' && !c.hasTie, 'Copeland desempata por duelos directos: gana A');
}

// 6) Entradas insuficientes: no se inventa un orden.
{
  ok(aggregateRanking(N, [M('m1', [1, 2, 3])]) === null, 'con un solo método no hay agregado (null)');
  ok(aggregateRanking(['A'], [M('m1', [1]), M('m2', [1])]) === null, 'con una sola alternativa no hay agregado (null)');
  ok(aggregateRanking(N, [M('m1', [1, 2]), M('m2', [1, 2, 3])]) === null, 'rankings de distinto largo → null');
  const t = describeAggregationRule('borda', 4, 6);
  ok(/Borda/.test(t) && /3 puntos/.test(t) && /máximo 18/.test(t), 'frase de Borda con los números reales (n = 4, 6 métodos): ' + t);
  ok(/Copeland/.test(describeAggregationRule('copeland', 4, 6)), 'frase de Copeland');
}

if (fallos) { console.error(`\n${fallos} verificaciones fallaron.`); process.exit(1); }
console.log('\nTodas las verificaciones de aggregateRanking pasaron.');
