let installed = false;
export function installInputBehavior() {
  if (installed) return;
  installed = true;
  const zeroField = target => target instanceof HTMLInputElement && target.type === 'number' && !target.readOnly && !target.disabled && /^0(?:\.0+)?$/.test(target.value);
  document.addEventListener('focusin', event => {
    if (zeroField(event.target)) event.target.select();
  });
  document.addEventListener('click', event => {
    if (zeroField(event.target)) event.target.select();
  });
  // Do not rewrite on input: number fields temporarily report "0" while a
  // decimal is being composed, and rewriting it would turn 0.05 into 5.
}
