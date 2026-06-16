const TEAM_CODES: Record<string, string> = {
  Uruguay: "URU",
  España: "ESP",
  Argentina: "ARG",
  México: "MEX",
  Brazil: "BRA",
  France: "FRA",
  Germany: "GER",
  England: "ENG",
  Spain: "ESP",
  Mexico: "MEX",
  USA: "USA",
  "United States": "USA",
  Portugal: "POR",
  Netherlands: "NED",
  Italy: "ITA",
  Belgium: "BEL",
  Croatia: "CRO",
  Japan: "JPN",
  "South Korea": "KOR",
  Colombia: "COL",
  Chile: "CHI",
  Ecuador: "ECU",
  Paraguay: "PAR",
  Peru: "PER",
  Canada: "CAN",
  Morocco: "MAR",
  Senegal: "SEN",
  Australia: "AUS",
};

export function abreviarEquipo(nombre: string): string {
  return TEAM_CODES[nombre] ?? nombre.slice(0, 3).toUpperCase();
}
