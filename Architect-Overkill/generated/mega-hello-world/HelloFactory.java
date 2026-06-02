package com.enterprise.hello.facade.impl;

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
