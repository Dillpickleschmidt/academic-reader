import { createMemo } from "solid-js";

export function createStableItems<T, K>(
	items: () => T[] | undefined,
	key: (item: T) => K,
	equals: (previous: T, next: T) => boolean,
) {
	return createMemo<T[] | undefined>((previous) => {
		const next = items();
		if (next === undefined) return undefined;
		if (previous === undefined) return next;

		const previousByKey = new Map<K, T>();
		for (const item of previous) previousByKey.set(key(item), item);

		let changed = previous.length !== next.length;
		const stable = next.map((item, index) => {
			const previousItem = previousByKey.get(key(item));
			if (previousItem && equals(previousItem, item)) {
				if (previous[index] !== previousItem) changed = true;
				return previousItem;
			}

			changed = true;
			return item;
		});

		return changed ? stable : previous;
	}, undefined);
}
