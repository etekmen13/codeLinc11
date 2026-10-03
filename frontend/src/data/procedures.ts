import type { Procedure } from "../types";

// Fees are rough US averages for illustration.
export const procedures: Procedure[] = [
  {
    cdt_code: "D1110",
    name: "Cleaning",
    description: "Routine cleaning to remove plaque and tartar.",
    category: "preventive",
    typical_fee: 120,
    treats_state: "healthy",
  },
  {
    cdt_code: "D1206",
    name: "Fluoride varnish",
    description: "Fluoride coating that can reverse a very early cavity.",
    category: "preventive",
    typical_fee: 40,
    treats_state: "early_lesion",
  },
  {
    cdt_code: "D2391",
    name: "Filling (back tooth, one surface)",
    description: "Removes decay and fills the tooth with tooth-colored resin.",
    category: "basic",
    typical_fee: 200,
    treats_state: "cavity",
  },
  {
    cdt_code: "D3330",
    name: "Root canal (molar)",
    description: "Removes infected nerve tissue from inside the tooth.",
    category: "major",
    typical_fee: 1200,
    treats_state: "root_canal",
  },
  {
    // Usually follows a root canal on a back tooth.
    cdt_code: "D2740",
    name: "Crown",
    description: "A cap that covers and protects a weakened tooth.",
    category: "major",
    typical_fee: 1300,
    treats_state: "root_canal",
  },
  {
    cdt_code: "D7140",
    name: "Simple extraction",
    description: "Removes a tooth that cannot be saved.",
    category: "basic",
    typical_fee: 220,
    treats_state: "extraction",
  },
];

export function findProcedure(cdt_code: string): Procedure | undefined {
  return procedures.find((p) => p.cdt_code === cdt_code);
}
