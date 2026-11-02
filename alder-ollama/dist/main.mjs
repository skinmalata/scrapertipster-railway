//#region alder:kernel
function $arrayLength(values) {
	return values.length;
}
function $ioPrint(value) {
	console.log(value);
}
function $cliArgs() {
	return globalThis.__alderHost?.args ?? [];
}
const taskType = Symbol.for("alder/Task");
const taskFactory = Symbol("alder/TaskFactory");
const maxOperationsBeforeYield = 1024;
let operationsRemaining = maxOperationsBeforeYield;
let readyFibers = [];
let drainScheduled = false;
let nextFiberId = 0;
let currentFiber = null;
const synchronousProviderContext = /* @__PURE__ */ new Map();
var ForeignDefect = class extends Error {
	constructor(cause, origin) {
		super(`Foreign task failed at ${origin}: ${describe(cause)}`, { cause });
		this.name = "AlderForeignDefect";
		this.origin = origin;
	}
};
var Interrupted = class extends Error {
	constructor(fiberId) {
		super(`Fiber ${fiberId} was interrupted`);
		this.name = "AlderInterrupted";
		this.fiberId = fiberId;
	}
};
function success(value) {
	return {
		$: "Success",
		value
	};
}
function failure(error) {
	return {
		$: "Failure",
		error
	};
}
function cloneContext(context) {
	return new Map([...context].map(([key, values]) => [key, [...values]]));
}
function taskIterator(task) {
	if (!task || task[taskType] !== true || typeof task[taskFactory] !== "function") throw new TypeError("Expected an Alder Task value");
	const iterator = task[taskFactory]();
	if (!iterator || typeof iterator.next !== "function" || typeof iterator.throw !== "function") throw new TypeError("An Alder Task factory did not return a generator");
	return iterator;
}
function $task(factory) {
	if (typeof factory !== "function") throw new TypeError("Task factory must be a function");
	return Object.freeze({
		[taskType]: true,
		[taskFactory]: factory,
		*[Symbol.iterator]() {
			return yield {
				$: "Call",
				task: this
			};
		}
	});
}
var FiberScope = class {
	constructor(owner) {
		this.owner = owner;
		this.state = "Empty";
		this.finalizers = [];
		this.exit = null;
		this.closePromise = null;
	}
	add(finalizer) {
		if (this.state === "Closed") return runFinalizer(finalizer(this.exit), this.owner.context);
		if (this.state === "Empty") this.state = "Open";
		this.finalizers.push(finalizer);
		return null;
	}
	async close(exit) {
		if (this.state === "Closed") return this.exit;
		if (this.state === "Closing") return this.closePromise;
		this.state = "Closing";
		this.exit = exit;
		this.closePromise = (async () => {
			const children = [...this.owner.children];
			for (const child of children) child.interruptUnsafe();
			await Promise.all(children.map((child) => child.awaitExit()));
			while (this.finalizers.length > 0) {
				const finalizer = this.finalizers.pop();
				let finalizerExit;
				try {
					finalizerExit = await runFinalizer(finalizer(exit), this.owner.context);
				} catch (error) {
					finalizerExit = failure(error);
				}
				if (exit.$ === "Success" && finalizerExit.$ === "Failure") exit = finalizerExit;
			}
			this.exit = exit;
			this.state = "Closed";
			return exit;
		})();
		return this.closePromise;
	}
};
var FiberImpl = class FiberImpl {
	constructor(task, parent = null, context = null) {
		this.id = ++nextFiberId;
		this.parent = parent;
		this.context = cloneContext(context ?? parent?.context ?? synchronousProviderContext);
		this.children = /* @__PURE__ */ new Set();
		this.scope = new FiberScope(this);
		this.state = "Running";
		this.exit = null;
		this.observers = /* @__PURE__ */ new Set();
		this.interruptRequested = false;
		this.interruptDelivered = false;
		this.interruptError = new Interrupted(this.id);
		this.interruptMask = 0;
		this.suspendedCancel = null;
		this.queued = false;
		this.resumeMethod = "next";
		this.resumeValue = void 0;
		this.iterator = taskIterator(task);
		this.taskFrames = [];
		this.exitPromise = new Promise((resolve) => {
			this.resolveExit = resolve;
		});
		if (parent) parent.children.add(this);
	}
	start() {
		schedule(this);
		return this;
	}
	awaitExit() {
		return this.exitPromise;
	}
	observe(observer) {
		if (this.state === "Done") {
			observer(this.exit);
			return () => {};
		}
		this.observers.add(observer);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			this.observers.delete(observer);
		};
	}
	interruptUnsafe() {
		if (this.state === "Done" || this.interruptRequested) return;
		this.interruptRequested = true;
		if (this.interruptMask === 0 && this.state === "Suspended") {
			const cancel = this.suspendedCancel;
			this.suspendedCancel = null;
			const resumeInterrupted = (error = this.interruptError) => {
				this.state = "Running";
				this.resumeMethod = "throw";
				this.resumeValue = error;
				this.interruptDelivered = true;
				schedule(this);
			};
			try {
				const cleanup = cancel?.();
				if (cleanup) Promise.resolve(cleanup).then(() => resumeInterrupted(), (error) => resumeInterrupted(error));
				else resumeInterrupted();
			} catch (error) {
				resumeInterrupted(error);
			}
		}
	}
	run() {
		if (this.state !== "Running") return;
		const previousFiber = currentFiber;
		currentFiber = this;
		try {
			while (this.state === "Running" && operationsRemaining > 0) {
				operationsRemaining -= 1;
				if (this.interruptRequested && !this.interruptDelivered && this.interruptMask === 0) {
					this.resumeMethod = "throw";
					this.resumeValue = this.interruptError;
					this.interruptDelivered = true;
				}
				const method = this.resumeMethod;
				const value = this.resumeValue;
				this.resumeMethod = "next";
				this.resumeValue = void 0;
				let step;
				try {
					step = this.iterator[method](value);
				} catch (error) {
					if (this.taskFrames.length > 0) {
						this.iterator = this.taskFrames.pop();
						this.resumeMethod = "throw";
						this.resumeValue = error;
						continue;
					}
					this.beginClose(failure(error));
					return;
				}
				if (step.done) {
					if (this.taskFrames.length > 0) {
						this.iterator = this.taskFrames.pop();
						this.resumeValue = step.value;
						continue;
					}
					this.beginClose(success(step.value));
					return;
				}
				try {
					const operation = step.value;
					if (!operation || typeof operation.$ !== "string") throw new TypeError("A task yielded an invalid runtime operation");
					if (this.handle(operation)) return;
				} catch (error) {
					this.resumeMethod = "throw";
					this.resumeValue = error;
				}
			}
			if (this.state === "Running") schedule(this);
		} finally {
			currentFiber = previousFiber;
		}
	}
	handle(operation) {
		switch (operation.$) {
			case "Call":
				try {
					const iterator = taskIterator(operation.task);
					this.taskFrames.push(this.iterator);
					this.iterator = iterator;
				} catch (error) {
					this.resumeMethod = "throw";
					this.resumeValue = error;
				}
				return false;
			case "Promise": return this.handlePromise(operation);
			case "Fork": {
				let child;
				try {
					child = new FiberImpl(operation.task, this).start();
				} catch (error) {
					this.resumeMethod = "throw";
					this.resumeValue = error;
					return false;
				}
				this.resumeValue = child;
				return false;
			}
			case "Join": return this.handleJoin(operation.fiber);
			case "Interrupt": return this.handleInterrupt(operation.fiber);
			case "All": return this.handleAll(operation.tasks);
			case "AllDiscard": return this.handleAll(operation.tasks, false);
			case "Race": return this.handleRace(operation.tasks);
			case "Scope": return this.handleScope(operation.task);
			case "SemaphoreAcquire": return this.suspend((resume) => {
				operation.semaphore.enqueue(operation.request, resume);
				return () => operation.semaphore.release(operation.request);
			});
			case "Finalizer": return this.handleFinalizer(operation.finalizer);
			case "Mask":
				this.interruptMask = Math.max(0, this.interruptMask + operation.delta);
				return false;
			default:
				this.resumeMethod = "throw";
				this.resumeValue = /* @__PURE__ */ new TypeError(`Unknown task operation: ${operation.$}`);
				return false;
		}
	}
	suspend(register) {
		this.state = "Suspended";
		let active = true;
		let cleanup = null;
		let registered = false;
		let cancelledDuringRegistration = null;
		this.suspendedCancel = () => {
			if (!active) return;
			active = false;
			if (registered) return cleanup?.();
			return new Promise((resolve, reject) => {
				cancelledDuringRegistration = {
					resolve,
					reject
				};
			});
		};
		const resume = (method, value) => {
			if (!active || this.state === "Done") return;
			active = false;
			this.suspendedCancel = null;
			this.state = "Running";
			this.resumeMethod = method;
			this.resumeValue = value;
			schedule(this);
		};
		try {
			cleanup = register(resume, () => active) ?? null;
		} catch (error) {
			resume("throw", error);
		}
		registered = true;
		if (cancelledDuringRegistration) {
			const { resolve, reject } = cancelledDuringRegistration;
			try {
				Promise.resolve(cleanup?.()).then(resolve, reject);
			} catch (error) {
				reject(error);
			}
		}
		return true;
	}
	handlePromise(operation) {
		return this.suspend((resume, isActive) => {
			let controller = null;
			let promise;
			let aborted = false;
			const cancel = () => {
				if (controller && !aborted) {
					aborted = true;
					controller.abort();
				}
			};
			try {
				controller = operation.abort ? new AbortController() : null;
				const returned = operation.thunk(controller?.signal);
				let then;
				try {
					then = returned?.then;
				} catch (error) {
					throw new ForeignDefect(error, operation.origin);
				}
				if (typeof returned !== "object" && typeof returned !== "function" || returned === null || typeof then !== "function") throw new ForeignDefect(/* @__PURE__ */ new TypeError("an asynchronous extern did not return a Promise"), operation.origin);
				promise = Promise.resolve(returned);
			} catch (error) {
				resume("throw", error instanceof ForeignDefect ? error : new ForeignDefect(error, operation.origin));
				return cancel;
			}
			promise.then((value) => resume("next", value), (error) => {
				if (!isActive()) return;
				if (operation.mapRejected) try {
					resume("next", operation.mapRejected(error));
				} catch (mappingError) {
					resume("throw", new ForeignDefect(mappingError, operation.origin));
				}
				else resume("throw", new ForeignDefect(error, operation.origin));
			});
			return cancel;
		});
	}
	handleJoin(fiber) {
		if (!(fiber instanceof FiberImpl)) {
			this.resumeMethod = "throw";
			this.resumeValue = /* @__PURE__ */ new TypeError("Fiber.join expected a Fiber value");
			return false;
		}
		if (fiber.state === "Done") {
			this.resumeMethod = fiber.exit.$ === "Success" ? "next" : "throw";
			this.resumeValue = fiber.exit.$ === "Success" ? fiber.exit.value : fiber.exit.error;
			return false;
		}
		return this.suspend((resume) => fiber.observe((exit) => {
			resume(exit.$ === "Success" ? "next" : "throw", exit.$ === "Success" ? exit.value : exit.error);
		}));
	}
	handleInterrupt(fiber) {
		if (!(fiber instanceof FiberImpl)) {
			this.resumeMethod = "throw";
			this.resumeValue = /* @__PURE__ */ new TypeError("Fiber.interrupt expected a Fiber value");
			return false;
		}
		fiber.interruptUnsafe();
		if (fiber.state === "Done") return false;
		return this.suspend((resume) => fiber.observe(() => resume("next", void 0)));
	}
	createChildren(tasks) {
		const children = [];
		try {
			for (const task of tasks) children.push(new FiberImpl(task, this));
		} catch (error) {
			for (const child of children) {
				child.interruptUnsafe();
				child.start();
			}
			return {
				children,
				failed: true,
				error
			};
		}
		for (const child of children) child.start();
		return {
			children,
			failed: false
		};
	}
	handleChildConstructionFailure(created) {
		return this.suspend((resume) => {
			const cleanup = Promise.all(created.children.map((child) => child.awaitExit()));
			cleanup.then(() => resume("throw", created.error));
			return () => cleanup;
		});
	}
	handleAll(tasks, collect = true) {
		if (!Array.isArray(tasks)) {
			this.resumeMethod = "throw";
			this.resumeValue = /* @__PURE__ */ new TypeError("Fiber.all expected an Array of tasks");
			return false;
		}
		const created = this.createChildren(tasks);
		if (created.failed) return this.handleChildConstructionFailure(created);
		const children = created.children;
		if (children.length === 0) {
			this.resumeValue = collect ? [] : void 0;
			return false;
		}
		return this.suspend((resume) => {
			const results = collect ? new Array(children.length) : void 0;
			const removers = [];
			let remaining = children.length;
			let settled = false;
			const finishFailure = async (error, winner) => {
				if (settled) return;
				settled = true;
				removers.forEach((remove) => remove());
				children.forEach((child) => {
					if (child !== winner) child.interruptUnsafe();
				});
				await Promise.all(children.map((child) => child.awaitExit()));
				resume("throw", error);
			};
			children.forEach((child, index) => {
				removers.push(child.observe((exit) => {
					if (settled) return;
					if (exit.$ === "Failure") {
						finishFailure(exit.error, child);
						return;
					}
					if (results) results[index] = exit.value;
					remaining -= 1;
					if (remaining === 0) {
						settled = true;
						removers.forEach((remove) => remove());
						resume("next", results);
					}
				}));
			});
			return () => {
				settled = true;
				removers.forEach((remove) => remove());
				children.forEach((child) => child.interruptUnsafe());
				return Promise.all(children.map((child) => child.awaitExit()));
			};
		});
	}
	handleRace(tasks) {
		if (!Array.isArray(tasks) || tasks.length === 0) {
			this.resumeMethod = "throw";
			this.resumeValue = /* @__PURE__ */ new TypeError("Fiber.race expected a non-empty Array of tasks");
			return false;
		}
		const created = this.createChildren(tasks);
		if (created.failed) return this.handleChildConstructionFailure(created);
		const children = created.children;
		return this.suspend((resume) => {
			const removers = [];
			let settled = false;
			const choose = async (winner, exit) => {
				if (settled) return;
				settled = true;
				removers.forEach((remove) => remove());
				children.forEach((child) => {
					if (child !== winner) child.interruptUnsafe();
				});
				await Promise.all(children.filter((child) => child !== winner).map((child) => child.awaitExit()));
				resume(exit.$ === "Success" ? "next" : "throw", exit.$ === "Success" ? exit.value : exit.error);
			};
			children.forEach((child) => removers.push(child.observe((exit) => choose(child, exit))));
			return () => {
				settled = true;
				removers.forEach((remove) => remove());
				children.forEach((child) => child.interruptUnsafe());
				return Promise.all(children.map((child) => child.awaitExit()));
			};
		});
	}
	handleScope(task) {
		let child;
		try {
			child = new FiberImpl(task, this).start();
		} catch (error) {
			this.resumeMethod = "throw";
			this.resumeValue = error;
			return false;
		}
		return this.suspend((resume) => {
			const remove = child.observe((exit) => {
				resume(exit.$ === "Success" ? "next" : "throw", exit.$ === "Success" ? exit.value : exit.error);
			});
			return () => {
				remove();
				child.interruptUnsafe();
				return child.awaitExit();
			};
		});
	}
	handleFinalizer(finalizer) {
		let pending;
		try {
			pending = this.scope.add(finalizer);
		} catch (error) {
			this.resumeMethod = "throw";
			this.resumeValue = error;
			return false;
		}
		if (!pending) return false;
		return this.suspend((resume) => pending.then((exit) => resume(exit.$ === "Success" ? "next" : "throw", exit.$ === "Success" ? void 0 : exit.error)));
	}
	beginClose(exit) {
		if (this.state === "Closing" || this.state === "Done") return;
		this.state = "Closing";
		this.suspendedCancel = null;
		this.scope.close(exit).then((closedExit) => this.complete(closedExit), (error) => this.complete(failure(error)));
	}
	complete(exit) {
		if (this.state === "Done") return;
		this.state = "Done";
		this.iterator = null;
		this.taskFrames.length = 0;
		this.exit = exit;
		if (this.parent) this.parent.children.delete(this);
		const observers = [...this.observers];
		this.observers.clear();
		this.resolveExit(exit);
		for (const observer of observers) try {
			observer(exit);
		} catch (error) {
			console.error("Fiber observer failed", error);
		}
	}
};
function schedule(fiber) {
	if (fiber.queued || fiber.state !== "Running") return;
	fiber.queued = true;
	readyFibers.push(fiber);
	scheduleDrain();
}
function scheduleDrain() {
	if (drainScheduled || readyFibers.length === 0) return;
	drainScheduled = true;
	if (operationsRemaining === 0) setTimeout(() => {
		operationsRemaining = maxOperationsBeforeYield;
		drainReadyFibers();
	}, 0);
	else queueMicrotask(drainReadyFibers);
}
function drainReadyFibers() {
	let index = 0;
	try {
		while (index < readyFibers.length && operationsRemaining > 0) {
			const fiber = readyFibers[index++];
			fiber.queued = false;
			fiber.run();
		}
	} finally {
		readyFibers = readyFibers.slice(index);
		drainScheduled = false;
		scheduleDrain();
	}
}
function runFinalizer(task, context) {
	let fiber;
	try {
		fiber = new FiberImpl(task, null, context);
		fiber.interruptMask = 1;
		fiber.start();
	} catch (error) {
		return Promise.resolve(failure(error));
	}
	return fiber.awaitExit();
}
function $runTask(task) {
	let fiber;
	try {
		fiber = new FiberImpl(task).start();
	} catch (error) {
		return Promise.reject(error);
	}
	return fiber.awaitExit().then((exit) => {
		if (exit.$ === "Success") return exit.value;
		throw exit.error;
	});
}
function $runMain(value) {
	return value?.[taskType] === true ? $runTask(value) : Promise.resolve(value);
}
function $tryPromise(thunk, abort = false, origin = "JavaScript extern", mapRejected = null) {
	return $task(function* () {
		return yield {
			$: "Promise",
			thunk,
			abort,
			origin,
			mapRejected
		};
	});
}
function describe(value) {
	if (value instanceof Error) return value.stack ?? value.message;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
const webStoreRegistryKey = Symbol.for("alder/webStores/v1");
const webStoreScopeKey = Symbol.for("alder/webStoreScope/v1");
const webStoreHandleKey = Symbol.for("alder/webStore/v1");
const webResourceContextKey = Symbol.for("alder/webResource/v1");
const webStoreRegistry = globalThis[webStoreRegistryKey] ??= {
	definitions: /* @__PURE__ */ new Map(),
	browser: null
};
const webProps = Symbol("alder/webProps");
const httpFetchHookKey = Symbol.for("alder/httpFetchHook/v1");

//#endregion
//#region alder-ollama/src/client.js
const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen3:4b";
async function chat(prompt, signal) {
	const response = await fetch(OLLAMA_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: MODEL,
			stream: false,
			messages: [{
				role: "user",
				content: prompt
			}]
		}),
		signal
	});
	if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
	const reply = (await response.json())?.message?.content;
	if (typeof reply !== "string") throw new Error("Ollama response had no message.content");
	return reply;
}

//#endregion
//#region alder://app/main.mjs
function $v_chat($a0) {
	return $task(function* () {
		return yield* $tryPromise(($signal) => {
			return chat($a0, $signal);
		}, true, "alder://app/main.mjs:7:25 extern ./client.js:chat");
	});
}
function $v_main() {
	return $task(function* () {
		let $l1_args = $cliArgs();
		let $t2;
		let $t3 = false;
		if (!$t3) {
			if ($arrayLength($l1_args) === 0) {
				$t2 = "Introduce yourself.";
				$t3 = true;
			}
		}
		if (!$t3) $t2 = $l1_args[0];
		return $ioPrint(yield* $v_chat($t2));
	});
}

//#endregion
//#region alder:entry
const $result = await $runMain($v_main());
if ($result && $result["$"] === "Err") {
	console["error"]($result["_0"]);
	globalThis["__alderHost"]["exit"](1);
} else globalThis["__alderHost"]["exit"](0);
var alder_entry_default = $result;

//#endregion
export { alder_entry_default as default };