import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { checkTrust, getVerifyStatus, resendAuthSMS, VerifyStatusResult } from '../services/ProveService';

const SMS_SEND_ATTEMPTS_LIMIT = 3;
const POLLING_INTERVAL_TIME_MS = 5000;

interface Props {
    accessToken: string;
    phoneNumber: string;
}

const SMS_CLICKED = 'sms_clicked';
const SMS_SENT = 'sms_sent';

const SMSWaitingPage = (props: Props) => {
    const navigate = useNavigate();

    const checkTrustPollingHandle = useRef<number>();
    const [loading, setLoading] = useState<boolean>(false);
    const [currentSendAttempt, setCurrentSendAttempt] = useState<number>(0);
    const [sendingLink, setSendingLink] = useState<boolean>(false);

    const resendButtonDisabled = useMemo(() => {
        return currentSendAttempt > SMS_SEND_ATTEMPTS_LIMIT || sendingLink;
    }, [currentSendAttempt, sendingLink]);

    const handleResendLink = async () => {
        if (sendingLink || resendButtonDisabled) {
            return;
        }

        try {
            setCurrentSendAttempt(currentSendAttempt + 1);
            await resendAuthSMS(props.accessToken);
        } catch (e) {
            //don't show anything for now when the resend fails
        } finally {
            setSendingLink(false);
        }
    }

    const checkUserTrust = async () => {
        try {
            setLoading(true);

            const result = await checkTrust(props.phoneNumber, props.accessToken);
            console.log('checkTrustResult: ', result);
            if (result.data.verified) {
                startPolling();
            } else {
                alert('Your identity could not be verified.');
                navigate(-1);
            }
        } catch (e) {
            alert('An error ocurred while contacting our servers. Please try again.');
            navigate(-1);
        } finally {
            setLoading(false);
        }
    }

    const startPolling = () => {
        const poll = async () => {
            try {
                const pollResult = await getVerifyStatus(props.accessToken);
                console.log('pollResult: ', pollResult);

                if (pollResult.data.state === SMS_CLICKED) {
                    clearInterval(checkTrustPollingHandle.current);
                    navigate('/review');
                } else {
                    //The user has not clicked their link yet...
                }
            } catch (e) {
                clearInterval(checkTrustPollingHandle.current);
                navigate('/verify-failure');
            }
        };

        checkTrustPollingHandle.current = setInterval(poll, POLLING_INTERVAL_TIME_MS);
    };

    const load = async () => {
        await checkUserTrust();
    };

    const cleanup = () => {
        if (checkTrustPollingHandle.current) {
            clearInterval(checkTrustPollingHandle.current);
        }
    };

    useEffect(() => {
        load();
        return () => cleanup();
    }, []);

    // Utility function to format phone number
    const formatPhoneNumber = (phoneNumber: string) => {
        const cleaned = ('' + phoneNumber).replace(/\D/g, '');
        const match = cleaned.match(/^(\d{1})(\d{3})(\d{3})(\d{4})$/);
        if (match) {
            return `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}`;
        }
        return phoneNumber;
    };

    return (
        <Container>
            {loading ? <Box pt={4} display="flex">
                <CircularProgress />
            </Box> :
                <Stack gap={2} sx={{ animation: '0.4s fadeIn forwards' }}>
                    <Typography
                        textAlign="left"
                        component="h1"
                        variant="h4"
                        fontWeight="bold"
                    >
                        Verify your mobile
                    </Typography>
                    <Typography
                        textAlign="left"
                        component="h2"
                        variant="h6"
                        fontWeight="bold"
                        pb={1}
                        mb={1}
                    > Please click on the link sent we just sent to <span style={{ display: 'inline-block' }}>
                            {formatPhoneNumber(props.phoneNumber)}
                        </span>
                    </Typography>
                    <Stack alignItems="center" gap={.1}>
                        <img className="fadeIn" width={70} height={70} src={`/img/linkPhone.png`} alt="Phone Image" style={{ marginBottom: '8px' }} />
                        <Typography variant="body1">Didn't recieve the link?</Typography>
                        <Button sx={{ textTransform: "none" }} disabled={resendButtonDisabled} onClick={handleResendLink}>
                            <Typography variant="body1">Resend the Link</Typography>
                        </Button>
                    </Stack>
                </Stack>
            }
        </Container>
    )
}

export default SMSWaitingPage;