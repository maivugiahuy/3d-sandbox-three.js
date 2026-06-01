const res = await fetch('config.json');
export const config = await res.json();
