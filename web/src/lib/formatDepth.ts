// Depth as text with a fixed number of decimals; tiny negatives ("-0.0") show as "0".
export function formatDepth(depthValue: number, decimals: number): string {
  const formattedDepth = depthValue.toFixed(decimals);
  return Number(formattedDepth) === 0 ? "0" : formattedDepth;
}
