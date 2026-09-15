export const isNumeric = (str: string) => typeof str === "string" && str.trim() !== "" && Number.isFinite(+str);
