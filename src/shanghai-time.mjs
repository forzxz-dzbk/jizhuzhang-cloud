const shanghaiParts = (date, options) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', ...options })
    .formatToParts(date)
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]),
);

export function shanghaiToday(date = new Date()) {
  const { year, month, day } = shanghaiParts(date, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${year}-${month}-${day}`;
}

export function shanghaiCurrentMonth(date = new Date()) {
  const { year, month } = shanghaiParts(date, { year: 'numeric', month: '2-digit' });
  return `${year}-${month}`;
}

export function formatShanghaiTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '时间未知';
  const { year, month, day, hour, minute } = shanghaiParts(date, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return `${year}-${month}-${day} ${hour}:${minute}`;
}
