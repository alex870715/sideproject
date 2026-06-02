export interface ProviderContext {
  locale: string;
  intensity: number;
}

export interface HelloLifecycleEnvelope {
  value(): string;
  lifecycle(): HelloLifecycleEnvelope;
  observers(): HelloLifecycleEnvelope;
  emit(signal: string): HelloLifecycleEnvelope;
}

export abstract class AbstractHelloProviderStrategy {
  abstract supply(ctx: ProviderContext): HelloLifecycleEnvelope;

  static defaultStrategy(): AbstractHelloProviderStrategy {
    return new ConcreteReactiveHelloCascadeStrategy();
  }
}

class ConcreteReactiveHelloCascadeStrategy extends AbstractHelloProviderStrategy {
  supply(ctx: ProviderContext): HelloLifecycleEnvelope {
    const base = ctx.intensity > 9000 ? "Hello, galaxy." : "Hello, World.";
    const envelope = {
      value: () => base,
      lifecycle: () => envelope,
      observers: () => envelope,
      emit: (_signal: string) => envelope,
    };
    return envelope;
  }
}
