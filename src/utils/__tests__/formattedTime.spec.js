import { formattedTime, futureRelativeTime } from '../formattedTime.ts'

const TIME = (61 * 60 + 5) * 1000 // 1 hour, 1 minute, 5 seconds in ms

describe('formattedTime', () => {
	it('should return the formatted time with optional spacing and padded minutes / seconds', () => {
		const result = formattedTime(TIME)
		expect(result).toBe('1 : 01 : 05')
		const resultCondensed = formattedTime(TIME, true)
		expect(resultCondensed).toBe('1:01:05')
	})

	it('should return fallback string when time value is falsy', () => {
		const result = formattedTime(0)
		expect(result).toBe('-- : --')
		const resultCondensed = formattedTime(0, true)
		expect(resultCondensed).toBe('--:--')
	})
})

describe('futureRelativeTime', () => {
	const fixedDate = new Date('2024-01-01T00:00:00Z')
	jest.spyOn(Date, 'now').mockImplementation(() => fixedDate.getTime())

	it('should return the correct string for time in hours', () => {
		const timeInFuture = Date.now() + (2 * 60 * 60 * 1000) // 2 hours from now
		const result = futureRelativeTime(timeInFuture)
		expect(result).toBe('In 2 hours')
	})

	it('should return the correct string for time in minutes', () => {
		const timeInFuture = Date.now() + (30 * 60 * 1000) // 30 minutes from now
		const result = futureRelativeTime(timeInFuture)
		expect(result).toBe('In 30 minutes')
	})

	it('should return the correct string for time in hours and minutes', () => {
		const timeInFuture = Date.now() + (2 * 60 * 60 * 1000) + (15 * 60 * 1000) // 2 hours and 15 minutes from now
		const result = futureRelativeTime(timeInFuture)
		expect(result).toBe('In 2 hours and 15 minutes')
	})

	it('should return the correct string for 1 hour and minutes', () => {
		const timeInFuture = Date.now() + (60 * 60 * 1000) + (15 * 60 * 1000) // 1 hour and 15 minutes from now
		const result = futureRelativeTime(timeInFuture)
		expect(result).toBe('In 1 hour and 15 minutes')
	})
})
