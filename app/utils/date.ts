export function formatDate(date: string | Date | null): string {
  if (!date) return '';
  
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${month}-${day}-${year}`;
}

export function formatDateInput(input: string): string {
  // Remove any non-digits
  const numbers = input.replace(/\D/g, '');
  
  // Add dashes after MM and DD
  if (numbers.length <= 2) return numbers;
  if (numbers.length <= 4) return `${numbers.slice(0, 2)}-${numbers.slice(2)}`;
  return `${numbers.slice(0, 2)}-${numbers.slice(2, 4)}-${numbers.slice(4, 8)}`;
}

export function isValidDate(dateString: string): boolean {
  // Check format MM-DD-YYYY
  const pattern = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])-\d{4}$/;
  if (!pattern.test(dateString)) return false;

  // Check if it's a valid date
  const [month, day, year] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day && date.getFullYear() === year;
} 