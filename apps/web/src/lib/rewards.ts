/** Bônus sobre todo dinheiro ganho em batalhas (selvagens, treinadores, ginásios, chefes e prêmios de torneio): +60%. */
export const moneyBonus = 1.6;

/** Aplica o bônus a um valor base, arredondando para baixo. */
export const earn = (base: number) => Math.floor(Math.round(base * moneyBonus * 100) / 100);
