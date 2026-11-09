import { describe, expect, it } from 'vitest';
import { leerPesos, pesos, pesosCortos, pesosParaCampo } from '../src/compartido/dinero';

describe('dinero', () => {
  it('muestra pesos argentinos', () => {
    expect(pesos(850000)).toBe('$ 8.500');
    expect(pesos(850050)).toBe('$ 8.500,50');
    expect(pesos(0)).toBe('$ 0');
    expect(pesosParaCampo(1250000)).toBe('12.500');
    expect(pesosParaCampo(1250050)).toBe('12.500,50');
    expect(pesos(-50000)).toBe('-$ 500');
  });

  it('lee lo que escribe la persona', () => {
    expect(leerPesos('8500')).toBe(850000);
    expect(leerPesos('8.500')).toBe(850000);
    expect(leerPesos('$ 8.500,5')).toBe(850050);
    expect(leerPesos('1.250.000')).toBe(125000000);
    expect(leerPesos('0')).toBe(0);
  });

  it('rechaza lo que no es un importe', () => {
    for (const malo of ['', 'abc', '8,500,00', '8.50', '-100', '1,234', '12.34.5']) {
      expect(leerPesos(malo), malo).toBeNull();
    }
  });

  it('pesos cortos para los gráficos', () => {
    expect(pesosCortos(850000)).toBe('$ 8.500');
    expect(pesosCortos(1250000)).toBe('$ 13 mil');
    expect(pesosCortos(1_000_000_00)).toBe('$ 1 M');
    expect(pesosCortos(1_250_000_00)).toBe('$ 1,3 M');
  });
});
