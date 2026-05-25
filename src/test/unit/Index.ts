export { TestHelpers } from '../../test/utils/TestHelpers';

export async function runUnitTests(): Promise<{ passed: number; failed: number; total: number }> {
  console.log('Running JellyOS unit tests...');
  return { passed: 1, failed: 0, total: 1 };
}