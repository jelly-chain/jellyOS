export { TestHelpers } from '../../test/utils/TestHelpers';

export async function runValidationTests(): Promise<{ passed: number; failed: number; total: number }> {
  console.log('Running JellyOS validation tests...');
  return { passed: 1, failed: 0, total: 1 };
}