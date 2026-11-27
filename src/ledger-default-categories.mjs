export const DEFAULT_CATEGORIES = Object.freeze({
  expense: Object.freeze([
    ['三餐', '🍜'], ['零食', '🍪'], ['衣服', '👕'], ['交通', '🚌'], ['旅行', '🏝️'],
    ['孩子', '🧒'], ['宠物', '🐾'], ['话费网费', '📱'], ['烟酒', '🍷'], ['学习', '📚'],
    ['日用品', '🧻'], ['住房', '🏠'], ['美妆', '💄'], ['医疗', '🏥'], ['红包', '🧧'],
    ['汽车/加油', '⛽'], ['娱乐', '🎮'], ['请客送礼', '🎁'], ['电器数码', '📷'], ['运动', '🏃'],
    ['其它', '◻️'], ['水电煤', '⚡'],
  ].map(([name, icon]) => Object.freeze({ name, icon }))),
  income: Object.freeze([
    ['工资', '💼'], ['奖金', '🎉'], ['兼职', '🧰'], ['投资收益', '📈'], ['礼金', '🧧'], ['其它收入', '💰'],
  ].map(([name, icon]) => Object.freeze({ name, icon }))),
});

export function missingDefaultCategories(existing, flow) {
  const known = new Set(existing.filter(item => item.flow === flow).map(item => item.name.trim().toLocaleLowerCase()));
  return DEFAULT_CATEGORIES[flow].filter(item => !known.has(item.name.toLocaleLowerCase()));
}
