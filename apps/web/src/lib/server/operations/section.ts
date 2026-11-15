import { toSection } from '../../features/section.ts';
import { noteRequestError } from './errors.ts';

/** 부분 실패의 화면 계약은 유지하고 원시 예외 대신 요청 문맥에 오류 코드만 남긴다. */
export function observedSection<T>(result: PromiseSettledResult<T>, label: string) {
    if (result.status === 'rejected') noteRequestError(result.reason);
    return toSection(result, label);
}
