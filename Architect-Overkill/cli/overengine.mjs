#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const out = join(process.argv[2] ?? join(root, 'generated'), 'mega-hello-world');

await mkdir(join(out, 'k8s'), { recursive: true });
await mkdir(join(out, 'docker'), { recursive: true });

await writeFile(
  join(out, 'HelloFactory.java'),
  `package com.enterprise.hello.facade.impl;

/** 單一例項工廠，負責協調問候詞的依存反轉。 */
public final class HelloFactory {

  private static volatile HelloFactory instance;

  private HelloFactory() {}

  public static HelloFactory getInstance() {
    if (instance == null) {
      synchronized (HelloFactory.class) {
        if (instance == null) {
          instance = new HelloFactory();
        }
      }
    }
    return instance;
  }

  public String createGreeting(AbstractHelloProviderStrategy.ProviderContext ctx) {
    return AbstractHelloProviderStrategy.defaultStrategy().supply(ctx)
        .lifecycle()
        .observers()
        .emit("GREETING_RESOLVED")
        .value();
  }
}
`
);

await writeFile(
  join(out, 'AbstractHelloProviderStrategy.ts'),
  `export interface ProviderContext {
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
`
);

await writeFile(
  join(out, 'IHelloLifecycleObserver.go'),
  `package hello

type Signal string

const (
	GreetingResolved Signal = "GREETING_RESOLVED"
)

// IHelloLifecycleObserver 將問候詞生命週期事件廣播到整個網格。
type IHelloLifecycleObserver interface {
	OnHelloPhaseTransition(phase string, payload map[string]string)
	OnSignal(signal Signal, correlationID string)
}
`
);

const services = ['api-gateway', 'greeting-core', 'observability-sidecar', 'policy-enforcer', 'legacy-shim-proxy'];
for (const name of services) {
  await writeFile(
    join(out, 'docker', `Dockerfile.${name}`),
    `FROM scratch
# 「我們在生產環境用 distroless，這裡先留一空映像以示謙卑。」
# service: ${name}
`
  );
}

await writeFile(
  join(out, 'k8s', 'deployment.yaml'),
  `apiVersion: apps/v1
kind: Deployment
metadata:
  name: architect-overkill-mesh
  labels:
    tier: needless-complexity
spec:
  replicas: 11
  selector:
    matchLabels:
      app: mega-hello
  template:
    metadata:
      labels:
        app: mega-hello
    spec:
      containers:
${services.map(
  (name, i) =>
    `      - name: ${name.replace(/-/g, '_')}
        image: your-registry.biz/architect-overkill/${name}:v0.${i + 1}.0-enterprise`
).join('\n')}
---
apiVersion: v1
kind: Service
metadata:
  name: mega-hello-lb
spec:
  selector:
    app: mega-hello
  ports:
    - port: 80
      targetPort: 8080
`
);

console.log(`已過度設計完成。請向客戶展示：${out}`);
