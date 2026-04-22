git reset HEAD~1
rm ./backport.sh
git cherry-pick 030b4882245d7d0115c019b76580ecb37b3239df
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
