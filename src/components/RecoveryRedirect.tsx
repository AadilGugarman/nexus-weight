import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function RecoveryRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    
    if (hash.includes('type=recovery')) {
      navigate(`/reset-password${hash}`, { replace: true });
    }
  }, [navigate]);

  return null;
}
