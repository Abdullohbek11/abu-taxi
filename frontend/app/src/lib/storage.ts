/** localStorage — xususiy rejim yoki bloklangan saytlarda xato tashlashi mumkin. */
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* saqlab bo'lmasa — shunchaki eslab qolinmaydi */
  }
}
