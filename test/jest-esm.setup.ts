// Under jest's ESM runtime the `jest` object is not injected as a global;
// expose it so specs can keep using jest.fn()/jest.spyOn() unchanged.
(globalThis as any).jest = (import.meta as any).jest;
