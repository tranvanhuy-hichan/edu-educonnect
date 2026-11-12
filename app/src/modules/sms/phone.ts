/** Số điện thoại di động Việt Nam dạng nội địa: 0 + (3|5|7|8|9) + 8 số. */
const VN_MOBILE = /^0[35789]\d{8}$/;

/** Chuẩn hoá về 0xxxxxxxxx; trả null nếu không phải số di động Việt Nam hợp lệ (+84, 84, dấu cách, chấm đều được). */
export function toVnMobile(raw: string | null | undefined): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length === 11) digits = "0" + digits.slice(2);
  else if (digits.length === 9 && /^[35789]/.test(digits)) digits = "0" + digits;
  return VN_MOBILE.test(digits) ? digits : null;
}

/** 090****123: đủ để tra cứu, không lộ số. */
export const maskPhone = (phone: string) => `${phone.slice(0, 3)}****${phone.slice(-3)}`;

/** Bỏ dấu tiếng Việt: tin nhắn không dấu tính 160 ký tự/tin và không phát sinh phụ phí Unicode. */
export const toAscii = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^\x20-\x7E\n]/g, " ").replace(/ {2,}/g, " ").trim();
