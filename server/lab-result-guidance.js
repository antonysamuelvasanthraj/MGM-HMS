/** Explanatory report text from recorded laboratory flags; never a diagnosis.
 * Glucose context: https://medlineplus.gov/lab-tests/blood-glucose-test/
 * Other tests retain their own separately edited service instructions.
 */
export function resultGuidance(results,serviceCode='') {
  const glucose=['LAB-RBS','LAB-FBS','LAB-PPBS','LAB-GTT'].includes(serviceCode);
  return results.filter(result=>['high','low','critical'].includes(result.flag)).map(result=>{
    const label=String(result.name || 'Result'),value=String(result.value ?? ''),unit=result.unit?` ${result.unit}`:'';
    const direction=result.flag==='high'?'above':result.flag==='low'?'below':null;
    const finding=direction?`${label}: ${value}${unit} is ${direction} this parameter's reported reference interval${result.ref_range?` (${result.ref_range})`:''}.`:`${label}: ${value}${unit} is flagged CRITICAL by the laboratory.`;
    let note=result.flag==='critical'?'Prompt clinical review and communication according to the hospital critical-result procedure are required.':`Review this ${result.flag} result with the requesting clinician, the patient's symptoms, previous results and the test-specific instructions below.`;
    if(glucose && result.flag==='high')note='This is a raised glucose result. Recent meals, acute illness, stress and medicines can affect glucose. Interpret with the sampling conditions and symptoms; the clinician may advise confirmatory glucose testing. This result alone is not an automatic diagnosis of diabetes.';
    if(glucose && result.flag==='low')note='This is a low glucose result relative to the reported interval. Review symptoms, sample timing and medicines with the treating clinician. A symptomatic or unexpected low result needs prompt clinical assessment.';
    return {parameter:label,flag:result.flag,finding,note};
  });
}
