import AuthForm from '../AuthForm';
import { login } from '@/app/actions/auth';

export default function LoginPage() {
    return (
        <AuthForm
            title="Log in"
            submitLabel="Log in"
            action={login}
            otherText="No account yet?"
            otherLabel="Sign up"
            otherHref="/signup"
        />
    );
}
