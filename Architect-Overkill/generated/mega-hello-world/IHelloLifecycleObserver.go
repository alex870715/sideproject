package hello

type Signal string

const (
	GreetingResolved Signal = "GREETING_RESOLVED"
)

// IHelloLifecycleObserver 將問候詞生命週期事件廣播到整個網格。
type IHelloLifecycleObserver interface {
	OnHelloPhaseTransition(phase string, payload map[string]string)
	OnSignal(signal Signal, correlationID string)
}
