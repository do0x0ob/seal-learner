/// Module: demo
module demo::demo {

    const ENoAccess: u64 = 0;

    public struct Counter has key {
        id: UID,
        count: u64,
    }

    public fun increment(counter: &mut Counter) {
        counter.count = counter.count + 1;
    }

    /// 創建並共享一個新的 Counter 物件
    fun init(ctx: &mut TxContext) {
        let counter = Counter {
            id: object::new(ctx),
            count: 0
        };
        transfer::share_object(counter);
    }

    entry fun seal_approve(_id: vector<u8>, cnt1: &Counter, cnt2: &Counter) {
        assert!(cnt1.count == cnt2.count, ENoAccess);
    }
}
