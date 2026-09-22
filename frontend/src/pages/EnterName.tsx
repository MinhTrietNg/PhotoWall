/**
 * S02 Nhập tên — DESIGN-D05, route "/name".
 *
 * The one piece of data the product needs, plus explicit consent before a real
 * person's face goes on a public screen. The CTA stays disabled until both are
 * satisfied.
 */
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { CheckRow, SettingRow, Toggle } from '@/components/Controls';
import { Field } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { Steps } from '@/components/Steps';
import { TopBar } from '@/components/TopBar';
import { track } from '@/lib/analytics';
import { useSession } from '@/state/SessionContext';
import { NAME_MAX, isNameValid, nextEmptySlot } from '@/types/session';
import styles from './EnterName.module.css';

export function EnterName() {
  const navigate = useNavigate();
  const { session, setName, setShowName, setConsent } = useSession();

  const canContinue = isNameValid(session.displayName) && session.consentGiven;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue) return;
    track('pw_name_done');
    navigate(`/camera/${nextEmptySlot(session) ?? 1}`);
  }

  return (
    <form className="screen" onSubmit={onSubmit}>
      <TopBar title="Bước 1 / 3" backTo="/" />
      <Steps current={1} />

      <div className={styles.body}>
        <div className={styles.intro}>
          <span className={styles.disc} aria-hidden="true">
            <Icon name="edit" size={32} />
          </span>
          <h1 className={`u ${styles.title}`}>Bạn tên gì?</h1>
          <p className={styles.sub}>Tên sẽ xuất hiện cùng dải ảnh của bạn trên màn hình lớn.</p>
        </div>

        <Field
          label="Tên của bạn"
          placeholder="VD: Minh Triết"
          value={session.displayName}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          counter
          helper="Tên thật hoặc nickname đều được."
          autoComplete="given-name"
          enterKeyHint="next"
        />
      </div>

      <div className={styles.consent}>
        <SettingRow
          title="Hiện tên trên màn hình lớn"
          description={'Tắt: hiển thị "Tân sinh viên" thay tên'}
          control={
            <Toggle
              checked={session.showName}
              onChange={setShowName}
              label="Hiện tên trên màn hình lớn"
            />
          }
        />

        <CheckRow
          checked={session.consentGiven}
          onChange={setConsent}
          label="Đồng ý hiển thị ảnh trên Photo Wall"
        >
          Tôi đồng ý cho ảnh hiển thị trên Photo Wall và màn hình lớn tại sự kiện; tôi có thể gỡ
          bất cứ lúc nào.
        </CheckRow>
      </div>

      <div className="screen__cta">
        <Button
          type="submit"
          block
          disabled={!canContinue}
          iconEnd={<Icon name="arrowForward" />}
        >
          Tiếp tục
        </Button>
      </div>
    </form>
  );
}
