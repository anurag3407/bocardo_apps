/** All money is integer paise. These helpers keep rounding rules in one place. */
export const rupees = (paise: number) => paise / 100;

export const percentOf = (paise: number, percent: number) => Math.round((paise * percent) / 100);

export const bpsOf = (paise: number, bps: number) => Math.round((paise * bps) / 10_000);

export const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);
