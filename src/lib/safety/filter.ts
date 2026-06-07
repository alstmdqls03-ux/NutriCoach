const PAIN_PATTERN =
  /(아프|아파|통증|부상|삐|결림|쑤시)|((허리|무릎|어깨|목|손목|발목|팔꿈치)\s*(가|이|을|를)?\s*(아|통|삐|결))/;

export const SAFETY_DISCLAIMER =
  '\n\n⚠️ 통증·부상 신호가 보여요. 무리하지 말고 증상이 지속되면 전문가(의사·물리치료사) 상담을 권합니다. 이 메시지는 의료 조언이 아니에요.';

export function detectPainSignal(userText: string): boolean {
  return PAIN_PATTERN.test(userText);
}

// The model often volunteers its own "see a professional / not medical advice"
// note. Detect that so we don't append a SECOND (duplicate) disclaimer.
const DISCLAIMER_SIGNAL = /의료\s*조언|전문가.{0,6}(상담|진료)|(의사|물리치료사)/;

export function applySafety(userText: string, assistantText: string): string {
  if (!detectPainSignal(userText)) return assistantText;
  // Guarantee a disclaimer is present, but never two: if the reply already
  // carries ours or the model's own, leave it; otherwise append the canonical one.
  if (assistantText.includes(SAFETY_DISCLAIMER) || DISCLAIMER_SIGNAL.test(assistantText)) {
    return assistantText;
  }
  return assistantText + SAFETY_DISCLAIMER;
}
