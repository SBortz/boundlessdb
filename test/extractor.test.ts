/**
 * Tests for Key Extractor
 */

import {describe, expect, it} from 'vitest';
import {KeyExtractionError, KeyExtractor} from '../src/config/extractor.js';
import type {ConsistencyConfig, NewEvent} from '../src/types.js';

describe('KeyExtractor', () => {
    describe('basic extraction', () => {
        const config: ConsistencyConfig = {
            eventTypes: {
                CourseCreated: {
                    keys: [{name: 'course', path: 'data.courseId'}],
                },
                StudentSubscribed: {
                    keys: [
                        {name: 'course', path: 'data.courseId'},
                        {name: 'student', path: 'data.studentId'},
                    ],
                },
            },
        };

        const extractor = new KeyExtractor(config);

        it('extracts single key', () => {
            const event: NewEvent = {
                type: 'CourseCreated',
                data: {courseId: 'cs101', name: 'Intro to CS'},
            };

            const keys = extractor.extract(event);

            expect(keys).toEqual([{name: 'course', value: 'cs101'}]);
        });

        it('extracts multiple keys', () => {
            const event: NewEvent = {
                type: 'StudentSubscribed',
                data: {courseId: 'cs101', studentId: 'alice'},
            };

            const keys = extractor.extract(event);

            expect(keys).toEqual([
                {name: 'course', value: 'cs101'},
                {name: 'student', value: 'alice'},
            ]);
        });

        it('returns empty array for unknown event type', () => {
            const event: NewEvent = {
                type: 'UnknownEvent',
                data: {foo: 'bar'},
            };

            const keys = extractor.extract(event);

            expect(keys).toEqual([]);
        });
    });

    describe('nested paths', () => {
        const config: ConsistencyConfig = {
            eventTypes: {
                OrderPlaced: {
                    keys: [
                        {name: 'customer', path: 'data.customer.id'},
                        {name: 'region', path: 'data.shipping.address.region'},
                    ],
                },
            },
        };

        const extractor = new KeyExtractor(config);

        it('extracts deeply nested values', () => {
            const event: NewEvent = {
                type: 'OrderPlaced',
                data: {
                    customer: {id: 'c123', name: 'Alice'},
                    shipping: {address: {region: 'EU', country: 'DE'}},
                },
            };

            const keys = extractor.extract(event);

            expect(keys).toEqual([
                {name: 'customer', value: 'c123'},
                {name: 'region', value: 'EU'},
            ]);
        });
    });

    describe('transforms', () => {
        const config: ConsistencyConfig = {
            eventTypes: {
                UserRegistered: {
                    keys: [{name: 'email', path: 'data.email', transform: 'LOWER'}],
                },
                EventScheduled: {
                    keys: [
                        {name: 'month', path: 'data.date', transform: 'MONTH'},
                        {name: 'year', path: 'data.date', transform: 'YEAR'},
                        {name: 'date', path: 'data.timestamp', transform: 'DATE'},
                    ],
                },
                ShoutEvent: {
                    keys: [{name: 'message', path: 'data.text', transform: 'UPPER'}],
                },
            },
        };

        const extractor = new KeyExtractor(config);

        it('applies LOWER transform', () => {
            const event: NewEvent = {
                type: 'UserRegistered',
                data: {email: 'Alice@Example.COM'},
            };

            const keys = extractor.extract(event);

            expect(keys).toEqual([{name: 'email', value: 'alice@example.com'}]);
        });

        it('applies UPPER transform', () => {
            const event: NewEvent = {
                type: 'ShoutEvent',
                data: {text: 'hello world'},
            };

            const keys = extractor.extract(event);

            expect(keys).toEqual([{name: 'message', value: 'HELLO WORLD'}]);
        });

        it('applies MONTH transform', () => {
            const event: NewEvent = {
                type: 'EventScheduled',
                data: {date: '2026-02-14', timestamp: '2026-02-14T10:30:00Z'},
            };

            const keys = extractor.extract(event);

            expect(keys).toContainEqual({name: 'month', value: '2026-02'});
        });

        it('applies YEAR transform', () => {
            const event: NewEvent = {
                type: 'EventScheduled',
                data: {date: '2026-02-14', timestamp: '2026-02-14T10:30:00Z'},
            };

            const keys = extractor.extract(event);

            expect(keys).toContainEqual({name: 'year', value: '2026'});
        });

        it('applies DATE transform', () => {
            const event: NewEvent = {
                type: 'EventScheduled',
                data: {date: '2026-02-14', timestamp: '2026-02-14T10:30:00Z'},
            };

            const keys = extractor.extract(event);

            expect(keys).toContainEqual({name: 'date', value: '2026-02-14'});
        });
    });

    describe('null handling', () => {
        it('throws on null by default', () => {
            const config: ConsistencyConfig = {
                eventTypes: {
                    Test: {
                        keys: [{name: 'value', path: 'data.missing'}],
                    },
                },
            };

            const extractor = new KeyExtractor(config);
            const event: NewEvent = {type: 'Test', data: {}};

            expect(() => extractor.extract(event)).toThrow(KeyExtractionError);
        });

        it('skips null when nullHandling is "skip"', () => {
            const config: ConsistencyConfig = {
                eventTypes: {
                    Test: {
                        keys: [
                            {name: 'required', path: 'data.required'},
                            {name: 'optional', path: 'data.optional', nullHandling: 'skip'},
                        ],
                    },
                },
            };

            const extractor = new KeyExtractor(config);
            const event: NewEvent = {type: 'Test', data: {required: 'yes'}};

            const keys = extractor.extract(event);

            expect(keys).toEqual([{name: 'required', value: 'yes'}]);
        });

        it('uses default value when nullHandling is "default"', () => {
            const config: ConsistencyConfig = {
                eventTypes: {
                    Test: {
                        keys: [
                            {
                                name: 'status',
                                path: 'data.status',
                                nullHandling: 'default',
                                defaultValue: 'unknown',
                            },
                        ],
                    },
                },
            };

            const extractor = new KeyExtractor(config);
            const event: NewEvent = {type: 'Test', data: {}};

            const keys = extractor.extract(event);

            expect(keys).toEqual([{name: 'status', value: 'unknown'}]);
        });
    });

    describe('type coercion', () => {
        const config: ConsistencyConfig = {
            eventTypes: {
                Test: {
                    keys: [{name: 'value', path: 'data.value'}],
                },
            },
        };

        const extractor = new KeyExtractor(config);

        it('converts numbers to strings', () => {
            const event: NewEvent = {type: 'Test', data: {value: 42}};
            const keys = extractor.extract(event);
            expect(keys).toEqual([{name: 'value', value: '42'}]);
        });

        it('converts bigints to strings', () => {
            const event: NewEvent = {type: 'Test', data: {value: 9007199254740993n}};
            const keys = extractor.extract(event);
            expect(keys).toEqual([{name: 'value', value: '9007199254740993'}]);
        });

        it('converts booleans to strings', () => {
            const event: NewEvent = {type: 'Test', data: {value: true}};
            const keys = extractor.extract(event);
            expect(keys).toEqual([{name: 'value', value: 'true'}]);
        });

        it('throws on objects', () => {
            const event: NewEvent = {type: 'Test', data: {value: {nested: true}}};
            expect(() => extractor.extract(event)).toThrow(KeyExtractionError);
        });

        it('throws on arrays', () => {
            const event: NewEvent = {type: 'Test', data: {value: [1, 2, 3]}};
            expect(() => extractor.extract(event)).toThrow(KeyExtractionError);
        });
    });
});
